const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 8002;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection
const MONGO_URI = "mongodb://admin:admin123@ac-9hn2wh0-shard-00-00.a8vfqxi.mongodb.net:27017,ac-9hn2wh0-shard-00-01.a8vfqxi.mongodb.net:27017,ac-9hn2wh0-shard-00-02.a8vfqxi.mongodb.net:27017/taskhub?ssl=true&replicaSet=atlas-kscb0h-shard-0&authSource=admin&appName=Cluster0";

console.log("Connecting to MongoDB...");
mongoose.connect(MONGO_URI)
  .then(() => console.log("MongoDB connected successfully."))
  .catch(err => {
    console.error("MongoDB connection error:", err);
  });

// --- Mongoose Schemas & Models ---

const CommentSchema = new mongoose.Schema({
  task_id: { type: Number, required: true },
  user_id: { type: Number, required: true },
  user_name: { type: String, required: true },
  comment: { type: String, required: true },
  created_at: { type: String, default: () => new Date().toISOString() }
}, { collection: 'comments' });

const Comment = mongoose.model('Comment', CommentSchema);

const TaskLogSchema = new mongoose.Schema({
  task_id: { type: Number, required: true },
  action: { type: String, required: true },
  old_status: { type: String, default: null },
  new_status: { type: String, default: null },
  old_assignee: { type: String, default: null },
  new_assignee: { type: String, default: null },
  assigned_user: { type: String, default: null },
  updated_by: { type: String, required: true },
  timestamp: { type: String, default: () => new Date().toISOString() }
}, { collection: 'task_logs' });

const TaskLog = mongoose.model('TaskLog', TaskLogSchema);

const TaskEmbeddingSchema = new mongoose.Schema({
  task_id: { type: Number, required: true, unique: true },
  embedding: { type: [Number], required: true },
  text: { type: String, required: true }
}, { collection: 'task_embeddings' });

const TaskEmbedding = mongoose.model('TaskEmbedding', TaskEmbeddingSchema);

const TaskSchema = new mongoose.Schema({
  task_id: { type: Number, required: true, unique: true },
  title: { type: String, required: true },
  description: { type: String, default: "" },
  due_date: { type: String, default: null },
  current_stage: { type: String, default: "Backlog" },
  assigned_to: {
    user_id: { type: Number, default: null },
    fullname: { type: String, default: null },
    email: { type: String, default: null }
  },
  created_at: { type: String, default: () => new Date().toISOString() }
}, { collection: 'tasks' });

const TaskModel = mongoose.model('Task', TaskSchema);

// --- APIs ---

// 1. Comments APIs
app.post('/api/comments', async (req, res) => {
  try {
    const { task_id, user_id, user_name, comment } = req.body;
    if (task_id === undefined || user_id === undefined || !user_name || !comment) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    const newComment = new Comment({ task_id, user_id, user_name, comment });
    await newComment.save();
    res.status(201).json({ message: "Comment added successfully.", comment: newComment });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/comments/:task_id', async (req, res) => {
  try {
    const taskId = parseInt(req.params.task_id);
    const comments = await Comment.find({ task_id: taskId }).sort({ created_at: 1 });
    res.json(comments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/comments/task/:task_id', async (req, res) => {
  try {
    const taskId = parseInt(req.params.task_id);
    await Comment.deleteMany({ task_id: taskId });
    res.json({ message: "Comments deleted successfully." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. Logs APIs
app.post('/api/logs', async (req, res) => {
  try {
    const { task_id, action, old_status, new_status, old_assignee, new_assignee, assigned_user, updated_by, timestamp } = req.body;
    if (task_id === undefined || !action || !updated_by) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    const log = new TaskLog({
      task_id,
      action,
      old_status,
      new_status,
      old_assignee,
      new_assignee,
      assigned_user,
      updated_by,
      timestamp: timestamp || new Date().toISOString()
    });
    await log.save();
    res.status(201).json({ message: "Log created successfully.", log });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/logs/:task_id', async (req, res) => {
  try {
    const taskId = parseInt(req.params.task_id);
    const logs = await TaskLog.find({ task_id: taskId }).sort({ timestamp: 1 });
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/logs/task/:task_id', async (req, res) => {
  try {
    const taskId = parseInt(req.params.task_id);
    await TaskLog.deleteMany({ task_id: taskId });
    res.json({ message: "Logs deleted successfully." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. Embeddings APIs
app.post('/api/embeddings', async (req, res) => {
  try {
    const { task_id, embedding, text } = req.body;
    if (task_id === undefined || !embedding || !text) {
      return res.status(400).json({ error: "Missing task_id, embedding or text" });
    }

    const updated = await TaskEmbedding.findOneAndUpdate(
      { task_id },
      { embedding, text },
      { upsert: true, new: true }
    );
    res.json({ message: "Embedding updated successfully.", updated });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/embeddings/task/:task_id', async (req, res) => {
  try {
    const taskId = parseInt(req.params.task_id);
    await TaskEmbedding.deleteOne({ task_id: taskId });
    res.json({ message: "Embedding deleted successfully." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 5. Tasks CRUD mirror APIs in MongoDB
app.post('/api/mongodb/tasks', async (req, res) => {
  try {
    const { task_id, title, description, due_date, current_stage, assigned_to } = req.body;
    if (task_id === undefined || !title) {
      return res.status(400).json({ error: "Missing task_id or title" });
    }
    const task = new TaskModel({
      task_id,
      title,
      description: description || "",
      due_date: due_date || null,
      current_stage: current_stage || "Backlog",
      assigned_to: assigned_to || { user_id: null, fullname: null, email: null }
    });
    await TaskModel.findOneAndUpdate({ task_id }, task, { upsert: true, new: true });
    res.status(201).json({ message: "Task stored in MongoDB successfully.", task });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/mongodb/tasks/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const updates = req.body;
    const updated = await TaskModel.findOneAndUpdate(
      { task_id: id },
      { $set: updates },
      { new: true }
    );
    res.json({ message: "Task updated in MongoDB successfully.", updated });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/mongodb/tasks/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await TaskModel.deleteOne({ task_id: id });
    res.json({ message: "Task deleted from MongoDB successfully." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/mongodb/tasks/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const task = await TaskModel.findOne({ task_id: id });
    res.json(task);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 4. Semantic Search (Local Cosine Similarity)
function cosineSimilarity(v1, v2) {
  if (!v1 || !v2 || v1.length !== v2.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < v1.length; i++) {
    dotProduct += v1[i] * v2[i];
    normA += v1[i] * v1[i];
    normB += v2[i] * v2[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

app.post('/api/semantic-search', async (req, res) => {
  try {
    const queryVector = req.body.query_vector || req.body.queryVector || req.body.embedding;
    if (!queryVector || !Array.isArray(queryVector)) {
      return res.status(400).json({ error: "Missing query_vector array" });
    }

    // Retrieve all embeddings
    const allEmbeddings = await TaskEmbedding.find({});
    
    // Compute similarities
    const results = allEmbeddings.map(doc => {
      const score = cosineSimilarity(queryVector, doc.embedding);
      return {
        task_id: doc.task_id,
        score: score
      };
    });

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);

    // Limit to top 10
    const topResults = results.slice(0, 10);
    res.json(topResults);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`Node.js MongoDB Microservice is running on port ${PORT}`);
});
