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

// Debug environment variable presence
if (!process.env.MONGODB_URI) {
    console.error('CRITICAL ERROR: MONGODB_URI environment variable is not defined!');
} else {
    const sanitized = process.env.MONGODB_URI.replace(/:([^@]+)@/, ':****@');
    console.log('MONGODB_URI is present. Attempting connection to:', sanitized);
}

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/visualpro', {
    bufferCommands: false // Disable buffering so errors show up instantly
}).then(() => console.log('✅ Connected to MongoDB Atlas via Mongoose'))
  .catch(err => {
      console.error('❌ MongoDB connection error:', err.message);
      if (err.message.includes('password')) {
          console.error('HINT: Check if your password contains special characters like @, :, or / and escape them, or use a simpler password.');
      }
  });

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
            { new: true, upsert: true }
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
    saveProject,
    getProjects,
    getProjectById,
    deleteProject,
    LOGS_DIR,
    Project
};
