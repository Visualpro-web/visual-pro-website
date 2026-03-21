const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { connectDB, saveProject, getProjects, getProjectById, deleteProject, Credential, Client, getClients, getClientByEmail, getClientById, saveClient, deleteClient, wipeDatabase, getCredentials, getCredentialById, saveCredential } = require('./dataService');
const { sendNewRequestEmails, sendStatusUpdateEmail } = require('./emailService');
const upload = require('./middlewares/upload');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'vp_secret_key_2026';
const { 
    generateRegistrationOptions, 
    verifyRegistrationResponse, 
    generateAuthenticationOptions, 
    verifyAuthenticationResponse 
} = require('@simplewebauthn/server');
const { isoBase64URL } = require('@simplewebauthn/server/helpers');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Content Security Policy (Basic)
app.use((req, res, next) => {
    res.setHeader("Content-Security-Policy", "default-src * 'unsafe-inline' 'unsafe-eval'; script-src * 'unsafe-inline' 'unsafe-eval'; style-src * 'unsafe-inline'; img-src * data: blob:; connect-src *;");
    next();
});

// Serve main website front-end
app.use(express.static(path.join(__dirname, '../')));

// Serve secure assets
app.use('/avatars', express.static(path.join(__dirname, '..', 'visualpro-data', 'clients', 'avatars')));
app.use('/deliverables', express.static(path.join(__dirname, '..', 'visualpro-data', 'projects', 'deliverables')));

// Debug Middleware
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// === Server-Sent Events (SSE) Setup ===
let clients = [];

const broadcastEvent = (eventType, payload) => {
    clients.forEach(client => {
        client.res.write(`event: ${eventType}\ndata: ${JSON.stringify(payload)}\n\n`);
    });
};

app.get('/api/events', (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
    });

    const clientId = Date.now();
    const newClient = { id: clientId, res };
    clients.push(newClient);

    // Render drops idle connections after 5m. This ping keeps it alive.
    const heartbeat = setInterval(() => {
        res.write(':\n\n');
    }, 15000);

    req.on('close', () => {
        clearInterval(heartbeat);
        clients = clients.filter(client => client.id !== clientId);
    });
});
app.get('/api/health', (req, res) => {
    const mongoose = require('mongoose');
    res.json({
        status: 'UP',
        database: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
        readyState: mongoose.connection.readyState,
        timestamp: new Date().toISOString()
    });
});
// === WebAuthn Biometric Auth Endpoints ===
const rpName = 'Visual Pro';
const origin = process.env.BASE_URL || `http://localhost:${PORT}`;
let rpID = 'localhost';
try { rpID = new URL(origin).hostname; } catch(e) {}


// Temporary store for challenges (In a real app, use a DB or Redis)
let currentChallenges = {}; 

// 1. Generate Registration Options
app.get('/api/admin/auth/register-options', adminAuth, (req, res) => {
    const options = generateRegistrationOptions({
        rpName,
        rpID,
        userID: 'admin-user',
        userName: 'Admin',
        attestationType: 'none',
        authenticatorSelection: {
            residentKey: 'preferred',
            userVerification: 'preferred',
            authenticatorAttachment: 'platform', // Enforce TouchID/FaceID
        },
    });

    currentChallenges['admin-user'] = options.challenge;
    res.json(options);
});

// 2. Verify Registration
app.post('/api/admin/auth/register-verify', adminAuth, async (req, res) => {
    const { body } = req;
    const expectedChallenge = currentChallenges['admin-user'];

    if (!expectedChallenge) {
        return res.status(400).json({ error: 'No challenge found' });
    }

    try {
        const verification = await verifyRegistrationResponse({
            response: body,
            expectedChallenge,
            expectedOrigin: origin,
            expectedRPID: rpID,
        });

        if (verification.verified) {
            const { registrationInfo } = verification;
            const { credentialID, credentialPublicKey, counter } = registrationInfo;

            // Save credential to DB
            const credData = {
                id: isoBase64URL.fromBuffer(credentialID),
                publicKey: Buffer.from(credentialPublicKey),
                counter,
                deviceType: 'singleDevice',
                backedUp: true,
                transports: body.response.transports || ['internal'],
                createdAt: new Date()
            };

            await saveCredential(credData);
            res.json({ verified: true });
        } else {
            res.status(400).json({ error: 'Verification failed' });
        }
    } catch (error) {
        console.error('Registration Verification Error:', error);
        res.status(500).json({ error: error.message });
    } finally {
        delete currentChallenges['admin-user'];
    }
});

// 3. Generate Authentication Options
app.get('/api/admin/auth/login-options', async (req, res) => {
    const credentials = await getCredentials();
    
    if (credentials.length === 0) {
        return res.status(400).json({ error: 'No fingerprint registered' });
    }

    const options = generateAuthenticationOptions({
        rpID,
        allowCredentials: credentials.map(cred => ({
            id: isoBase64URL.toBuffer(cred.id),
            type: 'public-key',
            transports: cred.transports,
        })),
        userVerification: 'preferred',
    });

    currentChallenges['login-admin'] = options.challenge;
    res.json(options);
});

// 4. Verify Authentication
app.post('/api/admin/auth/login-verify', async (req, res) => {
    const { body } = req;
    const expectedChallenge = currentChallenges['login-admin'];

    if (!expectedChallenge) {
        return res.status(400).json({ error: 'No challenge found' });
    }

    try {
        const credential = await getCredentialById(body.id);
        if (!credential) {
            throw new Error('Credential not found');
        }

        const verification = await verifyAuthenticationResponse({
            response: body,
            expectedChallenge,
            expectedOrigin: origin,
            expectedRPID: rpID,
            authenticator: {
                credentialID: isoBase64URL.toBuffer(credential.id),
                credentialPublicKey: credential.publicKey,
                counter: credential.counter,
            },
        });

        if (verification.verified) {
            // Update counter
            credential.counter = verification.authenticationInfo.newCounter;
            await saveCredential(credential);

            res.json({ verified: true, token: 'Bearer 01270101' }); // Return valid token
        } else {
            res.status(400).json({ error: 'Verification failed' });
        }
    } catch (error) {
        console.error('Authentication Verification Error:', error);
        res.status(500).json({ error: error.message });
    } finally {
        delete currentChallenges['login-admin'];
    }
});

// ======================================

// Serve admin and client tracking internally
app.get('/admin-dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin-dashboard.html'));
});

app.get('/project-status', (req, res) => {
    res.sendFile(path.join(__dirname, 'project-status.html'));
});

app.get('/portal', (req, res) => {
    res.sendFile(path.join(__dirname, 'portal-auth.html'));
});

app.get('/track-project', (req, res) => {
    res.sendFile(path.join(__dirname, 'track-project.html'));
});

// Fix for subagent's 404
app.get('/portal/dashboard', (req, res) => {
    res.redirect('/project-status');
});

// Basic Auth Middleware for protecting Admin Endpoints
function adminAuth(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (authHeader === 'Bearer 01270101') {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized Access' });
    }
}

// Client JWT Auth Middleware
function clientAuth(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            req.clientId = decoded.id;
            next();
        } catch (err) {
            res.status(401).json({ error: 'Token is invalid or expired' });
        }
    } else {
        res.status(401).json({ error: 'No token provided' });
    }
}

// === Project Workflow Configuration ===
const PROJECT_FLOW = [
    'Request Submitted',
    'Meeting Scheduled',
    'Proposal Sent',
    'Awaiting Approval',
    'Deposit Paid',
    'Production',
    'Editing',
    'Review',
    'Completed'
];

/**
 * Client API: Registration & Login
 */
app.post('/api/auth/register', upload.single('profileImage'), async (req, res) => {
    try {
        const { name, email, password } = req.body;
        if (!name || !email || !password) return res.status(400).json({ error: 'All fields required' });
        const existing = await getClientByEmail(email.toLowerCase());
        
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);
        
        let profileImage = '';
        if (req.file) {
            profileImage = req.file.path && req.file.path.startsWith('http') ? req.file.path : `/avatars/${req.file.filename}`;
        } else {
            // Automatically handled by client-side fallback if empty, but we can store empty
            profileImage = ''; 
        }
        
        const newClientData = {
            id: 'C-' + Date.now(),
            name,
            email: email.toLowerCase(),
            passwordHash,
            profileImage,
            createdAt: new Date()
        };
        
        const success = await saveClient(newClientData);
        if (!success) throw new Error('Failed to save client data');
        
        const token = jwt.sign({ id: newClientData.id }, JWT_SECRET, { expiresIn: '7d' });
        res.status(201).json({ message: 'Registered successfully', token, user: { name: newClientData.name, email: newClientData.email, profileImage: newClientData.profileImage } });
    } catch(err) {
        console.error('Register API Error:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const client = await getClientByEmail(email.toLowerCase());
        if (!client) return res.status(401).json({ error: 'Invalid credentials' });
        
        const isMatch = await bcrypt.compare(password, client.passwordHash);
        if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });
        
        const token = jwt.sign({ id: client.id }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, user: { name: client.name, email: client.email, profileImage: client.profileImage } });
    } catch (err) {
        console.error('Login Error:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.get('/api/client/me', clientAuth, async (req, res) => {
    try {
        const client = await getClientById(req.clientId);
        if (!client) return res.status(404).json({ error: 'Client not found' });
        res.json({ name: client.name, email: client.email, profileImage: client.profileImage });
    } catch (err) {
        console.error('Get Client Error:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.delete('/api/client/me', clientAuth, async (req, res) => {
    try {
        const success = await deleteClient(req.clientId);
        if (!success) return res.status(404).json({ error: 'Client not found or could not be deleted' });
        
        // Also delete their projects? The user didn't specify deleting projects, just the account.
        // For now, we only delete the account.
        res.json({ message: 'Account deleted successfully' });
    } catch (err) {
        console.error('Delete Client Error:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.get('/api/client/projects', clientAuth, async (req, res) => {
    try {
        const client = await getClientById(req.clientId);
        if (!client) return res.status(404).json({ error: 'Client not found' });
        
        const allProjects = await getProjects();
        const clientProjects = allProjects.filter(p => p.email && p.email.toLowerCase() === client.email.toLowerCase() && !p.hiddenFromClient);
        
        res.json(clientProjects.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)));
    } catch (err) {
        console.error('Projects Error:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

/**
 * Client Portal API: Login
 * Securely verify Email + Project ID
 */
app.post('/api/client-portal/login', async (req, res) => {
    const { email, projectId } = req.body;
    
    if (!email || !projectId) {
        return res.status(400).json({ error: 'Email and Project ID are required' });
    }

    try {
        const project = await getProjectById(projectId);
        
        if (project && project.email.toLowerCase() === email.toLowerCase()) {
            res.json({ success: true, id: project.id });
        } else {
            res.status(401).json({ error: 'Invalid email or Project ID.' });
        }
    } catch (err) {
        console.error('Login Error:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

/**
 * Client Portal API: Fetch specific project
 */
app.get('/api/client-portal/:id', async (req, res) => {
    const p = await getProjectById(req.params.id);
    if (!p) return res.status(404).json({ error: 'Project not found' });
    
    // Return sanitized data
    res.json({
        id: p.id,
        name: p.name,
        projectTitle: p.projectTitle || 'Visual Pro Production',
        projectType: p.projectType || 'Cinematic Video Production',
        location: p.propertyAddress || p.location || 'Not Specified',
        status: p.status,
        price: p.price || 0,
        depositPaid: p.depositPaid || false,
        finalPaid: p.finalPaid || false,
        videoUrl: p.finalPaid ? (p.videoUrl || null) : null,
        finalVideoUrl: p.finalVideoUrl,
        propertyAddress: p.propertyAddress,
        updates: p.updates || [],
        deliverables: p.finalPaid ? (p.deliverables || []) : [], // Locked until final payment
        meetingDate: p.meetingDate
    });
});

/**
 * Public Endpoint: Submit form
 */
app.post('/api/clients', async (req, res) => {
    try {
        const payload = req.body;
        if (!payload.name || !payload.email) {
            return res.status(400).json({ error: 'Missing req fields' });
        }

        const existingProjects = await getProjects();
        const existingIds = existingProjects
            .map(p => p.id && typeof p.id === 'string' && p.id.startsWith('VP-') ? parseInt(p.id.split('-')[1]) : null)
            .filter(n => !isNaN(n) && n !== null);
            
        const nextNum = existingIds.length > 0 ? Math.max(1024, Math.max(...existingIds) + 1) : 1024;
        const newId = `VP-${nextNum}`;

        const newProject = {
            id: newId,
            status: 'Request Submitted',
            createdAt: new Date().toISOString(),
            ...payload
        };

        const success = await saveProject(newProject);
        if(!success) throw new Error('Failed to save to VisualPro Data');

        // Async emails (no await so we don't block the response)
        sendNewRequestEmails(payload, newProject.id).catch(console.error);

        // Broadcast to Dashboard
        broadcastEvent('project_received', { id: newProject.id });

        res.status(201).json({ message: 'Saved successfully', id: newProject.id });
    } catch (err) {
        console.error('API Error:', err);
        res.status(500).json({ error: 'Internal error', message: err.message });
    }
});

/**
 * Admin: Get all clients
 */
app.get('/api/admin/clients', adminAuth, async (req, res) => {
    try {
        const clients = await getClients();
        res.json(clients);
    } catch(err) {
        res.status(500).json({ error: 'Error fetching clients' });
    }
});

/**
 * Admin: Get all projects
 */
app.get('/api/admin/projects', adminAuth, async (req, res) => {
    const all = await getProjects();
    res.json(all.filter(p => !p.hiddenFromAdmin));
});

/**
 * Admin: Update Status
 */
app.patch('/api/admin/projects/:id', adminAuth, async (req, res) => {
    try {
        const { status, rejectionReason, price, discount, videoUrl, newUpdate, deliverables, projectType, location, depositPaid, finalPaid } = req.body;
        const project = await getProjectById(req.params.id);
        
        if(!project) return res.status(404).json({ error: 'Project not found' });

        if (status) {
            // Rejection logic overrides flow
            if (status === 'Project Rejected') {
                project.status = 'Project Rejected';
                project.rejectionReason = rejectionReason || 'Request not accepted.';
            } else {
                project.status = status;
                // If Accepted, move to next automatically if specified
                if (status === 'Project Accepted' && price) {
                    project.price = price;
                }
            }
            // Send Email
            sendStatusUpdateEmail(project, project.status);
        }

        if (price !== undefined) project.price = price;
        if (discount !== undefined) project.discount = discount;
        if (videoUrl !== undefined) project.videoUrl = videoUrl;
        if (projectType !== undefined) project.projectType = projectType;
        if (location !== undefined) project.location = location;
        if (depositPaid !== undefined) project.depositPaid = depositPaid;
        if (finalPaid !== undefined) project.finalPaid = finalPaid;
        
        // Handle New Update
        if (newUpdate) {
            if (!project.updates) project.updates = [];
            project.updates.push({
                timestamp: new Date(),
                message: newUpdate
            });
        }

        // Handle Deliverables
        if (deliverables) {
            project.deliverables = deliverables;
        }
        
        await saveProject(project);

        // Broadcast status update
        broadcastEvent('project_updated', { id: project.id, status: project.status, project: project });

        res.json({ message: 'Updated', project });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Update failed' });
    }
});

/**
 * Admin: Upload Deliverables
 */
app.post('/api/admin/projects/:id/deliverables', adminAuth, upload.array('deliverables', 10), async (req, res) => {
    try {
        const project = await getProjectById(req.params.id);
        if(!project) return res.status(404).json({ error: 'Project not found' });
        
        if (!project.deliverables) project.deliverables = [];
        
        if (req.files) {
            req.files.forEach(file => {
                const url = file.path && file.path.startsWith('http') ? file.path : `/deliverables/${file.filename}`;
                project.deliverables.push({
                    label: file.originalname,
                    url: url,
                    size: file.size ? (file.size / (1024*1024)).toFixed(2) + ' MB' : 'Unknown',
                    type: file.mimetype ? (file.mimetype.startsWith('video') ? 'video' : 'file') : 'file'
                });
            });
        }
        
        await saveProject(project);
        broadcastEvent('project_updated', { id: project.id, status: project.status, project });
        
        const client = await getClientByEmail(project.email.toLowerCase());
        if (client) {
            const { sendProjectDeliveryEmail } = require('./emailService');
            sendProjectDeliveryEmail(client, project);
        }
        
        res.json({ message: 'Files uploaded successfully', deliverables: project.deliverables });
    } catch(err) {
        console.error(err);
        res.status(500).json({ error: 'Upload failed' });
    }
});

/**
 * Client Portal API: Upload Payment Receipt
 */
/**
 * Client Portal API: Upload Payment Receipt
 */
app.post('/api/projects/:id/receipt', clientAuth, upload.single('paymentReceipt'), async (req, res) => {
    try {
        const project = await getProjectById(req.params.id);
        if (!project) return res.status(404).json({ error: 'Project not found' });
        
        // Verify ownership (or match email)
        const client = await getClientById(req.clientId);
        if (!client || client.email.toLowerCase() !== project.email.toLowerCase()) {
            return res.status(403).json({ error: 'Unauthorized to update this project' });
        }

        const receiptUrl = req.file.path && req.file.path.startsWith('http') ? req.file.path : `/visualpro-data/projects/receipts/${req.file.filename}`;
        
        // Determine if it's deposit or final based on current status
        if (project.status === 'Deposit Paid') {
            project.depositReceipt = receiptUrl;
            project.depositPaid = true;
            // Mark step as completed by advancing directly to Production
            project.status = 'Production';
        } else if (project.status === 'Review' || project.status === 'Final Payment Required') {
            project.finalReceipt = receiptUrl;
        } else {
            return res.status(400).json({ error: 'Project is not in a payment stage' });
        }

        await saveProject(project);
        
        // Send email to admin
        const { sendProjectDeliveryEmail } = require('./emailService'); // Actually lets reuse the notification but for manual payment
        // We'll trust existing broadcast will notify frontends
        
        broadcastEvent('project_updated', { id: project.id, status: project.status, project });
        
        res.json({ message: 'Receipt uploaded successfully. Step marked as completed.', receiptUrl });
    } catch (err) {
        console.error('Receipt Upload Error:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

/**
 * Client Portal API: Schedule Meeting
 */
app.post('/api/projects/:id/meeting', clientAuth, async (req, res) => {
    try {
        const { date, phone } = req.body;
        const project = await getProjectById(req.params.id);
        if (!project) return res.status(404).json({ error: 'Project not found' });
        
        const client = await getClientById(req.clientId);
        if (!client || client.email.toLowerCase() !== project.email.toLowerCase()) {
            return res.status(403).json({ error: 'Unauthorized to update this project' });
        }

        project.meetingDate = date;
        if(phone) project.phone = phone;

        await saveProject(project);
        
        broadcastEvent('project_updated', { id: project.id, status: project.status, project });

        // Send email to admin
        const { sendMeetingScheduledEmail } = require('./emailService');
        if (typeof sendMeetingScheduledEmail === 'function') {
             sendMeetingScheduledEmail(client.name, project, phone, date).catch(console.error);
        }
        
        res.json({ message: 'Meeting scheduled successfully' });
    } catch (err) {
        console.error('Meeting Schedule Error:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

/**
 * Client Portal API: Project Decision (Accept/Decline)
 */
app.post('/api/projects/:id/decision', clientAuth, async (req, res) => {
    try {
        const { decision } = req.body;
        const project = await getProjectById(req.params.id);
        if (!project) return res.status(404).json({ error: 'Project not found' });
        
        const client = await getClientById(req.clientId);
        if (!client || client.email.toLowerCase() !== project.email.toLowerCase()) {
            return res.status(403).json({ error: 'Unauthorized to update this project' });
        }

        if (project.status !== 'Awaiting Approval') {
            return res.status(400).json({ error: 'Project is not awaiting approval' });
        }

        if (decision === 'accept') {
            project.status = 'Deposit Paid';
        } else if (decision === 'decline') {
            project.status = 'Project Cancelled';
        } else {
            return res.status(400).json({ error: 'Invalid decision' });
        }

        await saveProject(project);
        broadcastEvent('project_updated', { id: project.id, status: project.status, project });
        
        res.json({ message: `Project ${decision}ed successfully` });
    } catch (err) {
        console.error('Decision Error:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

/**
 * Admin API: Rename Project
 */
app.patch('/api/admin/projects/:id/rename', adminAuth, async (req, res) => {
    try {
        const { title } = req.body;
        if (!title) return res.status(400).json({ error: 'Title required' });
        
        const project = await getProjectById(req.params.id);
        if (!project) return res.status(404).json({ error: 'Project not found' });
        
        project.projectTitle = title;
        await saveProject(project);
        broadcastEvent('project_updated', { id: project.id, status: project.status, project });
        
        res.json({ message: 'Project renamed', project });
    } catch(err) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

/**
 * Admin API: Upload Final Video
 */
app.post('/api/admin/projects/:id/final-video', adminAuth, upload.single('finalVideoFile'), async (req, res) => {
    try {
        const project = await getProjectById(req.params.id);
        if (!project) return res.status(404).json({ error: 'Project not found' });
        
        let url = req.body.finalVideoUrl;
        if (req.file) {
            url = req.file.path && req.file.path.startsWith('http') ? req.file.path : `/deliverables/${req.file.filename}`;
        }

        project.finalVideoUrl = url;
        await saveProject(project);
        broadcastEvent('project_updated', { id: project.id, status: project.status, project });
        
        res.json({ message: 'Final video saved', project });
    } catch (err) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

/**
 * Admin API: Verify Manual Payment
 */
app.patch('/api/admin/projects/:id/verify-payment', adminAuth, async (req, res) => {
    try {
        const { type } = req.body; // 'deposit' or 'final'
        const project = await getProjectById(req.params.id);
        if (!project) return res.status(404).json({ error: 'Project not found' });

        if (type === 'deposit') {
            project.depositPaid = true;
            project.status = 'Project Started';
        } else if (type === 'final') {
            project.finalPaid = true;
            project.status = 'Project Completed';
        } else {
            return res.status(400).json({ error: 'Invalid payment type' });
        }

        await saveProject(project);
        
        // Send notification email
        sendStatusUpdateEmail(project, project.status);
        broadcastEvent('project_updated', { id: project.id, status: project.status, project });

        res.json({ message: 'Payment verified successfully', project });
    } catch (err) {
        console.error('Verify Payment Error:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

/**
 * Admin: Destroy Entire Database
 */
app.delete('/api/admin/nuke-db', adminAuth, async (req, res) => {
    try {
        await wipeDatabase();
        broadcastEvent('project_deleted', { id: 'all' });
        res.json({ message: 'DB successfully reset.' });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * Admin: Delete Project (Safe Delete)
 */
app.delete('/api/admin/projects/:id', adminAuth, async (req, res) => {
    try {
        const project = await getProjectById(req.params.id);
        if (!project) return res.status(404).json({ error: 'Project not found' });
        
        project.hiddenFromAdmin = true;
        await saveProject(project);

        broadcastEvent('project_deleted', { id: project.id });
        res.json({ message: 'Safely deleted successfully' });
    } catch(err) {
        console.error('Admin Delete Error:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

/**
 * Client: Safe Delete Project
 */
app.delete('/api/projects/:id', clientAuth, async (req, res) => {
    try {
        if (req.params.id === 'all') {
            const client = await getClientById(req.clientId);
            if (!client) return res.status(404).json({ error: 'Client not found' });
            
            const allProjects = await getProjects();
            for (const p of allProjects) {
                if (p.email && p.email.toLowerCase() === client.email.toLowerCase()) {
                    p.hiddenFromClient = true;
                    await saveProject(p);
                }
            }
            return res.json({ message: 'All projects removed successfully' });
        }

        const project = await getProjectById(req.params.id);
        if (!project) return res.status(404).json({ error: 'Project not found' });
        
        const client = await getClientById(req.clientId);
        if (!client || client.email.toLowerCase() !== project.email.toLowerCase()) {
            return res.status(403).json({ error: 'Unauthorized' });
        }
        
        project.hiddenFromClient = true;
        await saveProject(project);
        
        res.json({ message: 'Project removed successfully' });
    } catch(err) {
        res.status(500).json({ error: 'Internal error' });
    }
});


// Global Error Handler for Multer and other errors
app.use((err, req, res, next) => {
    console.error('SERVER ERROR:', err);
    if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: `Upload error: ${err.message}` });
    }
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

const startServer = async () => {
    console.log('🚀 Starting Visual Pro Server...');
    const dbConnected = await connectDB();
    
    if (dbConnected) {
        app.listen(PORT, () => {
            console.log(`✅ Visual Pro Server is LIVE on port ${PORT}`);
        });
    } else {
        console.error('❌ FATAL: Server could NOT start because database connection failed.');
        console.error('REASON: Check your MONGODB_URI and Password in Render Environment Variables.');
        // We don't call app.listen() here so Render knows it failed.
    }
};

startServer();
