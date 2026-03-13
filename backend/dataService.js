const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'visualpro-data');
const CLIENTS_DIR = path.join(DATA_DIR, 'clients');
const PROJECTS_DIR = path.join(DATA_DIR, 'projects');
const LOGS_DIR = path.join(DATA_DIR, 'email-logs');

// Ensure directories exist
[DATA_DIR, CLIENTS_DIR, PROJECTS_DIR, LOGS_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

const getFilePath = (dir, id) => path.join(dir, `${id}.json`);

const readData = (dir) => {
    try {
        const files = fs.readdirSync(dir);
        return files
            .filter(f => f.endsWith('.json'))
            .map(f => {
                const content = fs.readFileSync(path.join(dir, f), 'utf-8');
                return JSON.parse(content);
            });
    } catch (err) {
        console.error(`Error reading directory ${dir}:`, err);
        return [];
    }
};

const writeData = (dir, id, data) => {
    try {
        fs.writeFileSync(getFilePath(dir, id), JSON.stringify(data, null, 2));
        return true;
    } catch (err) {
        console.error(`Error writing to ${dir}/${id}.json:`, err);
        return false;
    }
};

const deleteData = (dir, id) => {
    try {
        const file = getFilePath(dir, id);
        if (fs.existsSync(file)) {
            fs.unlinkSync(file);
            return true;
        }
        return false;
    } catch (err) {
        console.error(`Error deleting ${dir}/${id}.json:`, err);
        return false;
    }
};

// Client Operations (For isolated client records, though project holds main data)
const getClients = () => readData(CLIENTS_DIR);
const saveClient = (client) => writeData(CLIENTS_DIR, client.id, client);

// Project Operations
const getProjects = () => readData(PROJECTS_DIR);
const getProjectById = (id) => {
    const file = getFilePath(PROJECTS_DIR, id);
    if (fs.existsSync(file)) {
        return JSON.parse(fs.readFileSync(file, 'utf-8'));
    }
    return null;
};
const saveProject = (project) => writeData(PROJECTS_DIR, project.id, project);
const deleteProject = (id) => deleteData(PROJECTS_DIR, id);

module.exports = {
    saveClient,
    getClients,
    saveProject,
    getProjects,
    getProjectById,
    deleteProject,
    LOGS_DIR
};
