require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { connectDB, saveProject, getProjects, getProjectById, deleteProject } = require('./dataService');
const { sendNewRequestEmails, sendStatusUpdateEmail } = require('./emailService');

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
const adminAuth = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (authHeader === 'Bearer admin123') {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized Access' });
    }
};

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
        let nextNum = 1024;
        existingProjects.forEach(p => {
            if (p.id && p.id.startsWith('VP-')) {
                const num = parseInt(p.id.split('-')[1]);
                if (!isNaN(num) && num >= nextNum) {
                    nextNum = num + 1;
                }
            }
        });
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
