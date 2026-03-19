const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const LOGS_DIR = path.join(__dirname, '..', 'visualpro-data', 'email-logs');
// Ensure logs dir exists - handle read-only filesystems in cloud
try {
    if (!fs.existsSync(LOGS_DIR)) {
        fs.mkdirSync(LOGS_DIR, { recursive: true });
    }
} catch (e) {
    console.error('Warning: could not create logs directory:', e.message);
}

const connectDB = async () => {
    try {
        if (!process.env.MONGODB_URI) {
            console.log('⚠️ Running in memory mode without MongoDB.');
            return true;
        }
        
        const sanitized = process.env.MONGODB_URI.replace(/:([^@]+)@/, ':****@');
        console.log(`🔗 Connecting to: ${sanitized}`);
        
        await mongoose.connect(process.env.MONGODB_URI);
        
        console.log('✅ MongoDB connection established.');
        return true;
    } catch (err) {
        console.error('❌ MongoDB connection FAILED:', err.message);
        return false;
    }
};

const projectSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    status: { type: String, default: 'Request Received' },
    createdAt: { type: String },
    name: { type: String, required: true },
    email: { type: String, required: true },
    phone: String,
    propertyAddress: String,
    projectTitle: String,
    desiredDate: String,
    rejectionReason: String,
    date: String,
    time: String,
    price: { type: Number, default: 0 },
    depositPaid: { type: Boolean, default: false },
    finalPaid: { type: Boolean, default: false },
    stripeSessionId: String,
    videoUrl: String,
    // Client Portal Features
    projectType: { type: String, default: 'Cinematic Video Production' },
    location: String,
    updates: [{
        timestamp: { type: Date, default: Date.now },
        message: String
    }],
    deliverables: [{
        label: String,
        url: String,
        size: String,
        resolution: String,
        type: String // 'video', 'image', etc.
    }]
}, { strict: false }); // Allow flexible fields

const Project = mongoose.model('Project', projectSchema);

const credentialSchema = new mongoose.Schema({
    id: String, // base64url encoded credential ID
    publicKey: Buffer,
    counter: Number,
    deviceType: String,
    backedUp: Boolean,
    transports: [String],
    createdAt: { type: Date, default: Date.now }
});

const Credential = mongoose.model('Credential', credentialSchema);

let mockProjects = [];

const getProjects = async () => {
    if(!process.env.MONGODB_URI) return mockProjects;
    return await Project.find({}).lean();
};

const getProjectById = async (id) => {
    if(!process.env.MONGODB_URI) return mockProjects.find(p => p.id === id);
    return await Project.findOne({ id }).lean();
};

const saveProject = async (projectData) => {
    if(!process.env.MONGODB_URI) {
        const idx = mockProjects.findIndex(p => p.id === projectData.id);
        if(idx >= 0) mockProjects[idx] = projectData;
        else mockProjects.push(projectData);
        return true;
    }
    try {
        await Project.findOneAndUpdate(
            { id: projectData.id },
            projectData,
            { returnDocument: 'after', upsert: true }
        );
        return true;
    } catch(err) {
        console.error('Error saving project:', err);
        return false;
    }
};

const deleteProject = async (id) => {
    if(!process.env.MONGODB_URI) {
        const initial = mockProjects.length;
        mockProjects = mockProjects.filter(p => p.id !== id);
        return mockProjects.length < initial;
    }
    try {
        const result = await Project.deleteOne({ id });
        return result.deletedCount > 0;
    } catch(err) {
        console.error('Error deleting project:', err);
        return false;
    }
};

module.exports = {
    connectDB,
    saveProject,
    getProjects,
    getProjectById,
    deleteProject,
    LOGS_DIR,
    Project,
    Credential
};
