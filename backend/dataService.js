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

// Connect to MongoDB Function
const connectDB = async () => {
    try {
        if (!process.env.MONGODB_URI) {
            console.error('❌ CRITICAL: MONGODB_URI is not defined in Environment Variables!');
            return false;
        }
        
        const sanitized = process.env.MONGODB_URI.replace(/:([^@]+)@/, ':****@');
        console.log(`🔗 Connecting to: ${sanitized}`);
        
        // Mongoose 6+ connection doesn't need useNewUrlParser/useUnifiedTopology
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
    time: String
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

const getProjects = async () => {
    return await Project.find({}).lean();
};

const getProjectById = async (id) => {
    return await Project.findOne({ id }).lean();
};

const saveProject = async (projectData) => {
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
