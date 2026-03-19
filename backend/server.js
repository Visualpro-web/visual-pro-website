require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { connectDB, saveProject, getProjects, getProjectById, deleteProject, Credential } = require('./dataService');
const { sendNewRequestEmails, sendStatusUpdateEmail } = require('./emailService');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_mock');
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

// === Project Workflow Configuration ===
const PROJECT_FLOW = [
    'Request Submitted',
    'Request Under Review',
    'Project Accepted',
    'Meeting Scheduled',
    'Deposit Required',
    'Project Started',
    'Filming In Progress',
    'Editing In Progress',
    'Final Review',
    'Final Payment Required',
    'Project Completed'
];

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
        propertyAddress: p.propertyAddress,
        updates: p.updates || [],
        deliverables: p.finalPaid ? (p.deliverables || []) : [] // Locked until final payment
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
        const { status, rejectionReason, price, videoUrl, newUpdate, deliverables, projectType, location, depositPaid, finalPaid } = req.body;
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
 * Stripe: Create Checkout Session
 */
app.post('/api/create-checkout-session', async (req, res) => {
    try {
        const { projectId, type } = req.body; // type: 'deposit' or 'final'
        const project = await getProjectById(projectId);

        if (!project || !project.price) {
            return res.status(400).json({ error: 'Project not found or price not set' });
        }

        const amount = type === 'deposit' ? Math.round(project.price / 2) : Math.round(project.price / 2);
        
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'usd',
                    product_data: {
                        name: `${type === 'deposit' ? '50% Deposit' : 'Final Balance'} - ${project.id}`,
                        description: `Payment for project: ${project.projectTitle || project.id}`,
                    },
                    unit_amount: amount * 100, // Stripe uses cents
                },
                quantity: 1,
            }],
            mode: 'payment',
            success_url: `${origin}/project-status?id=${projectId}&payment=success`,
            cancel_url: `${origin}/project-status?id=${projectId}&payment=cancel`,
            metadata: {
                projectId: project.id,
                paymentType: type
            }
        });

        res.json({ id: session.id, url: session.url });
    } catch (err) {
        console.error('Stripe Session Error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * Stripe: Webhook
 */
app.post('/api/webhook/stripe', express.raw({type: 'application/json'}), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        // In production, use stripe.webhooks.constructEvent
        // For local development without stripe-cli, we can look at the body directly
        // but it's less secure. 
        event = req.body; 
        
        if (event.type === 'checkout.session.completed') {
            const session = event.data.object;
            const { projectId, paymentType } = session.metadata;

            const project = await getProjectById(projectId);
            if (project) {
                if (paymentType === 'deposit') {
                    project.depositPaid = true;
                    project.status = 'Project Started';
                } else if (paymentType === 'final') {
                    project.finalPaid = true;
                    project.status = 'Project Completed';
                }
                
                await saveProject(project);

                // Notifications
                sendStatusUpdateEmail(project, project.status);
                broadcastEvent('project_updated', { id: project.id, status: project.status, project: project });
            }
        }

        res.json({received: true});
    } catch (err) {
        res.status(400).send(`Webhook Error: ${err.message}`);
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
