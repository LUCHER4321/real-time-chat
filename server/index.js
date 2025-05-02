import express from 'express';
import logger from 'morgan';
import dotenv from 'dotenv';
import { createClient } from '@libsql/client';
import { Server } from 'socket.io';
import { createServer } from 'node:http';

dotenv.config();
const PORT = process.env.PORT ?? 3000;

const app = express();
const server = createServer(app);
const io = new Server(server, {
    connectionStateRecovery: {}
});

const db = createClient({
    url: process.env.DB_URL,
    authToken: process.env.DB_AUTH_TOKEN,
});

db.execute(`
    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        user TEXT
    );
`);

io.on("connection", async (socket) => {
    console.log("An user connected 🥳!");

    socket.on("disconnect", () => {
        console.log("An user disconnected 😢!");
    });

    socket.on("chat message", async (msg) => {
        let result;
        let username;
        try {
            username = socket.handshake.auth.username ?? "Anonymous";
            result = await db.execute({
                sql: "INSERT INTO messages (content, user) VALUES (:msg, :username);",
                args: { msg, username }
            });
        } catch (error) {
            console.error("Error inserting message:", error);
            return;
        }
        console.log("Message:", msg);
        io.emit("chat message", msg, result.lastInsertRowid.toString(), username);
    });

    if(!socket.recovered){
        try {
            const results = await db.execute({
                sql: "SELECT * FROM messages WHERE id > ? ORDER BY created_at ASC;",
                args: [socket.handshake.auth.serverOffset ?? 0],
            });
            results.rows.forEach(row => socket.emit("chat message", row.content, row.id.toString(), row.user, row.created_at))
        } catch (error) {
            console.error("Error fetching messages:", error);
            return;
        }
    }
});

app.use(logger("dev"))

app.get("/", (req, res) => {
    res.sendFile(process.cwd() + "/client/index.html");
});

server.listen(PORT, () => {
    console.log(`Server is running on port http://localhost:${PORT}`);
});