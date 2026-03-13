require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { connectDB, saveProject, getProjects, getProjectById, deleteProject, Credential } = require('./dataService');
const { sendNewRequestEmails, sendStatusUpdateEmail } = require('./emailService');
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

// Serve main website front-end
app.use(express.static(path.join(__dirname, '../')));

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

    req.on('close', () => {
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
const origin = process.env.BASE_URL || 'http://localhost:3000';
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
            const newCredential = new Credential({
                id: isoBase64URL.fromBuffer(credentialID),
                publicKey: Buffer.from(credentialPublicKey),
                counter,
                deviceType: 'singleDevice',
                backedUp: true,
                transports: body.response.transports || ['internal'],
            });

            await newCredential.save();
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
    const credentials = await Credential.find({});
    
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
        const credential = await Credential.findOne({ id: body.id });
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
            await credential.save();

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

app.get('/track-project', (req, res) => {
    res.sendFile(path.join(__dirname, 'track-project.html'));
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

/**
 * Client Portal API: Fetch specific project
 */
app.get('/api/client-portal/:id', async (req, res) => {
    const p = await getProjectById(req.params.id);
    if (!p) return res.status(404).json({ error: 'Project not found' });
    
    // Return sanitized data (don't expose internal notes if we had them)
    res.json({
        id: p.id,
        name: p.name,
        projectTitle: p.projectTitle,
        status: p.status
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
            status: 'Request Received',
            createdAt: new Date().toISOString(),
            ...payload
        };

        const success = await saveProject(newProject);
        if(!success) throw new Error('Failed to save to VisualPro Data');

        // Async emails
        sendNewRequestEmails(payload, newProject.id);

        // Broadcast to Dashboard
        broadcastEvent('project_received', { id: newProject.id });

        res.status(201).json({ message: 'Saved successfully', id: newProject.id });
    } catch (err) {
        console.error('API Error:', err);
        res.status(500).json({ error: 'Internal error', message: err.message });
    }
});

/**
 * Admin: Get all projects
 */
app.get('/api/admin/projects', adminAuth, async (req, res) => {
    res.json(await getProjects());
});

/**
 * Admin: Update Status
 */
app.patch('/api/admin/projects/:id', adminAuth, async (req, res) => {
    try {
        const { status, rejectionReason } = req.body;
        const project = await getProjectById(req.params.id);
        
        if(!project) return res.status(404).json({ error: 'Project not found' });

        project.status = status;
        if (rejectionReason) {
            project.rejectionReason = rejectionReason;
        }
        
        await saveProject(project);

        sendStatusUpdateEmail(project, status);

        // Broadcast status update to all connected clients (client page and dashboard)
        broadcastEvent('project_updated', { id: project.id, status: status, project: project });

        res.json({ message: 'Updated', project });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Update failed' });
    }
});

/**
 * Admin: Delete Project
 */
app.delete('/api/admin/projects/:id', adminAuth, async (req, res) => {
    const id = req.params.id;
    const success = await deleteProject(id);
    if(success) {
        broadcastEvent('project_deleted', { id });
        res.json({ message: 'Deleted successfully' });
    } else {
        res.status(404).json({ error: 'Project not found or delete failed' });
    }
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
