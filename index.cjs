const express = require('express');
const { Pool } = require('pg');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());

// PostgreSQL
const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'postgres',
    password: 'postgres',
    port: 5432,
});

const createTasksTable = `
  CREATE TABLE IF NOT EXISTS tasks (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(20) DEFAULT 'ToDo',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    labels INTEGER ARRAY
  );
`;

const createUsersTable= `
  CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(255) NOT NULL,
  password VARCHAR(255) NOT NULL
);
`;

const createLabelsTable = `
  CREATE TABLE IF NOT EXISTS labels (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL
  );
`;

pool.query(createTasksTable + createLabelsTable + createUsersTable, (err, res) => {
    if (err) {
        console.error(err);
    } else {
        console.log('Tables created successfully');
    }
});

// Middleware

app.use((req, res, next) => {
    if (req.headers['x-forwarded-proto'] !== 'https' && process.env.NODE_ENV === 'production') {
        return res.redirect(['https://', req.get('Host'), req.url].join(''));
    }
    return next();
});


const helmet = require('helmet');
app.use(
    helmet({
        hsts: {
            maxAge: 31536000,
            includeSubDomains: true,
            preload: true,
        },
    })
);


const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
});

app.use(limiter);


// Authorization
app.post('/register', async (req, res) => {
    try {
        const hashedPassword = await bcrypt.hash(req.body.password, 10);
        const user = await pool.query('INSERT INTO users (username, password) VALUES ($1, $2) RETURNING *', [req.body.username, hashedPassword]);
        res.status(201).json({ message: 'User registered successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/login', async (req, res) => {
    const user = await pool.query('SELECT * FROM users WHERE username = $1', [req.body.username]);

    if (user.rows.length > 0) {
        const passwordMatch = await bcrypt.compare(req.body.password, user.rows[0].password);
        if (passwordMatch) {
            const token = jwt.sign({ username: user.rows[0].username }, 'sercet');
            res.json({ token });
        } else {
            res.status(401).json({ error: 'Invalid credentials' });
        }
    } else {
        res.status(401).json({ error: 'Invalid credentials' });
    }
});

// JWT TOKEN
const authenticateToken = (req, res, next) => {
    const token = req.header('Authorization');
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    jwt.verify(token, 'sercet', (err, user) => {
        if (err) return res.status(403).json({ error: 'Forbidden' });
        req.user = user;
        next();
    });
};

// Tasks
app.post('/tasks', authenticateToken, async (req, res) => {
    console.log(req.body.status)
    try {
        if(req.body.status !== "toDo" && req.body.status !== "InProgress" && req.body.status !== "Done"){
            res.status(400).json({ error: 'Invalid task status' });
        }
        else{
            const task = await pool.query('INSERT INTO tasks (title, description, status, labels) VALUES ($1, $2, $3, $4) RETURNING *', [
                req.body.title,
                req.body.description,
                req.body.status,
                req.body.labels,
            ]);
            res.status(201).json(task.rows[0]);
        }
    } catch (error) {
        console.error(error);
        res.status(400).json({ error: 'Invalid task data' });
    }
});

app.get('/tasks', authenticateToken, async (req, res) => {
    const tasks = await pool.query('SELECT * FROM tasks');
    res.json(tasks.rows);
});

app.put('/tasks/:id', authenticateToken, async (req, res) => {
    try {
        const task = await pool.query('UPDATE tasks SET title = $1, description = $2, status = $3, labels = $4 WHERE id = $5 RETURNING *', [
            req.body.title,
            req.body.description,
            req.body.status,
            req.body.labels,
            req.params.id,
        ]);
        res.json(task.rows[0]);
    } catch (error) {
        console.error(error);
        res.status(400).json({ error: 'Invalid task data' });
    }
});

app.delete('/tasks/:id', authenticateToken, async (req, res) => {
    await pool.query('DELETE FROM tasks WHERE id = $1', [req.params.id]);
    res.json({ message: 'Task deleted successfully' });
});

// Labels
app.post('/labels', authenticateToken, async (req, res) => {
    try {
        const label = await pool.query('INSERT INTO labels (name) VALUES ($1) RETURNING *', [req.body.name]);
        res.status(201).json(label.rows[0]);
    } catch (error) {
        console.error(error);
        res.status(400).json({ error: 'Invalid label data' });
    }
});

app.get('/labels', authenticateToken, async (req, res) => {
    const labels = await pool.query('SELECT * FROM labels');
    res.json(labels.rows);
});

app.put('/labels/:id', authenticateToken, async (req, res) => {
    try {
        const label = await pool.query('UPDATE labels SET name = $1 WHERE id = $2 RETURNING *', [req.body.name, req.params.id]);
        res.json(label.rows[0]);
    } catch (error) {
        console.error(error);
        res.status(400).json({ error: 'Invalid label data' });
    }
});

app.delete('/labels/:id', authenticateToken, async (req, res) => {
    await pool.query('DELETE FROM labels WHERE id = $1', [req.params.id]);
    res.json({ message: 'Label deleted successfully' });
});



app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
