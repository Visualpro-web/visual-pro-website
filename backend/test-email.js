const { sendStatusUpdateEmail } = require('./emailService');

const mockProject = {
    id: "test-approval-123",
    name: "Manny",
    email: "munelstg0@gmail.com",
    projectTitle: "Live Test Request"
};

// 'Project Started' is the status that triggers the approval email
console.log("Dispatching approval email...");
sendStatusUpdateEmail(mockProject, 'Project Started').then(() => {
    console.log("Email dispatch complete.");
}).catch(console.error);
