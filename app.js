const express = require("express");
const mysql = require("mysql2");
const bodyParser = require("body-parser");
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const moment = require("moment");

const app = express();
app.use(cors());
app.use(bodyParser.json());

const PORT = 9000;

const db = mysql.createPool({
  host: "localhost",
  user: "root",
  password: "Admin@123",
  database: "burn_it",
});

db.getConnection((err, connection) => {
  if (err) {
    console.error("Error connecting to MySQL database:", err);
    return;
  }
  console.log("Connected to MySQL database");
  connection.release();
});

const createUserTableSQL = `
  CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(255) NOT NULL,
    password VARCHAR(255) NOT NULL
  )
`;

// Creating user table
db.query(createUserTableSQL, (err) => {
  if (err) {
    console.error("Error creating user table:", err);
    return;
  }
});

const createItemsTableSQL = `
CREATE TABLE IF NOT EXISTS items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT,
  date DATE NOT NULL,
  food_items VARCHAR(1000) NOT NULL,
  calories VARCHAR(1000) NOT NULL,
  prices VARCHAR(1000) NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
)
`;

// Creating items table
db.query(createItemsTableSQL, (err) => {
  if (err) {
    console.error("Error creating item table:", err);
    return;
  }
});

//Create a new user
app.post("/api/user", (req, res) => {
  const { username, password } = req.body;
  const aleadyExist = "SELECT * FROM users WHERE username = ?";
  db.query(aleadyExist, [username], (err, results) => {
    if (err) {
      console.error("Error creating user:", err);
      res
        .status(500)
        .json({ status: "error", message: "Error creating an user" });
      return;
    }
    if (results.length > 0) {
      res
        .status(406)
        .json({ status: "error", message: "Username already exist!" });
      return;
    }
    const sql = "INSERT INTO users (username, password) VALUES (?, ?)";
    db.query(sql, [username, password], (err, resp) => {
      if (err) {
        console.error("Error creating user:", err);
        res
          .status(500)
          .json({ status: "error", message: "Error creating an user" });
        return;
      }
      res.status(201).json({
        status: "success",
        message: "User created successfully. Please login.",
        data: resp.insertId,
      });
    });
  });
});

// Login an user
app.post("/api/login", (req, res) => {
  const { username, password } = req.body;
  const sql = "SELECT * FROM users WHERE username = ?";
  db.query(sql, [username], (err, results) => {
    if (err) {
      console.error("Error while logging in an user:", err);
      res
        .status(500)
        .json({ status: "error", message: "Error while logging in an user" });
      return;
    }
    if (results.length === 0) {
      res.status(406).json({
        status: "error",
        message: "No such user found!",
      });
      return;
    }
    let user = results[0];
    if (user.password != password) {
      res.status(406).json({
        status: "error",
        message: "Password mismatched. Please enter the correct password",
      });
      return;
    }
    const jwtSecret = process.env.JWT_SECRET;
    const token = jwt.sign({ data: results[0] }, jwtSecret, {
      expiresIn: "1h",
    });
    res.status(200).json({
      status: "success",
      message: "User logged in successfully",
      data: results[0],
      token,
    });
  });
});

// Create a new item
app.post("/api/items/:user_id", (req, res) => {
  const userId = req.params.user_id;
  const { date, food_items, calories, prices } = req.body;
  const sql =
    "INSERT INTO items (user_id, date, food_items, calories, prices) VALUES (?, ?, ?, ?, ?)";
  db.query(sql, [userId, date, food_items, calories, prices], (err, resp) => {
    if (err) {
      console.error("Error creating item:", err);
      res
        .status(500)
        .json({ status: "error", message: "Error creating an item" });
      return;
    }
    res.status(201).json({
      status: "success",
      message: "Item(s) added successfully",
    });
  });
});

// Read all items
app.get("/api/items/:user_id/", (req, res) => {
  let userId = req.params.user_id;
  const sql = `
  SELECT * FROM items WHERE user_id = ? ORDER BY date;
`;
  db.query(sql, [userId], (err, results) => {
    if (err) {
      console.error("Error fetching items:", err);
      res
        .status(500)
        .json({ status: "error", message: "Error fetching items" });
      return;
    }
    const groupedData = [];
    results.forEach((row) => {
      let { id, user_id, date, food_items, calories, prices } = row;
      date = moment(date).format("YYYY-MM-DD");
      groupedData.push({ id, user_id, date, food_items, calories, prices });
    });
    res.status(200).json({ status: "success", data: groupedData });
  });
});

//Read all used dates
app.get("/api/used-dates/:user_id", (req, res) => {
  let userId = req.params.user_id;
  console.log("aaaaaaaaa", userId);
  const sql = `
  SELECT date FROM items WHERE user_id = ? ORDER BY date;
`;
  db.query(sql, [userId], (err, results) => {
    if (err) {
      console.error("Error fetching items:", err);
      res
        .status(500)
        .json({ status: "error", message: "Error fetching items" });
      return;
    }
    const dates = [];
    results.forEach((row) => {
      let dateString = row.date;
      let inputDate = new Date(dateString);
      inputDate.setDate(inputDate.getDate() + 1);
      let formattedDate = inputDate.toISOString().split("T")[0];
      dates.push(formattedDate);
    });
    res.status(200).json({ status: "success", data: dates });
  });
});

// Read filtered items
app.get("/api/items/:user_id/:month/:search", (req, res) => {
  let userId = req.params.user_id;
  let month = req.params.month;
  let search = req.params.search;

  const sql = `
  SELECT * FROM items WHERE user_id = ? ${
    month != "all" ? "AND MONTH(date) = ?" : ""
  } ${search != "all" ? "AND food_items LIKE ?" : ""} ORDER BY date;
`;
  db.query(
    sql,
    month != "all" && search === "all"
      ? [userId, month]
      : search != "all" && month === "all"
      ? [userId, `%${search}%`]
      : month != "all" && search != "all"
      ? [userId, month, `%${search}%`]
      : [userId],
    (err, results) => {
      if (err) {
        console.error("Error fetching items:", err);
        res
          .status(500)
          .json({ status: "error", message: "Error fetching items" });
        return;
      }
      const groupedData = [];
      results.forEach((row) => {
        let { id, user_id, date, food_items, calories, prices } = row;
        date = moment(date).format("YYYY-MM-DD");
        groupedData.push({ id, user_id, date, food_items, calories, prices });
      });
      res.status(200).json({ status: "success", data: groupedData });
    }
  );
});

// Read a single item by ID
app.get("/api/item/:user_id/:item_id", (req, res) => {
  let userId = req.params.user_id;
  let itemId = req.params.item_id;
  const sql = `
  SELECT * FROM items WHERE id = ? AND user_id = ?;`;
  db.query(sql, [itemId, userId], (err, results) => {
    if (err) {
      console.error("Error fetching items:", err);
      res
        .status(500)
        .json({ status: "error", message: "Error fetching items" });
      return;
    }
    res.status(200).json({ status: "success", data: results });
  });
});

// Update an item by ID
app.put("/api/item/:id", (req, res) => {
  const itemId = req.params.id;
  const { foodItems, calories, prices } = req.body;
  const sql =
    "UPDATE items SET food_items = ?, calories = ?, prices = ? WHERE id = ?";
  db.query(sql, [foodItems, calories, prices, itemId], (err) => {
    if (err) {
      console.error("Error updating item:", err);
      res.status(500).json({ status: "error", message: "Error updating item" });
      return;
    }
    res
      .status(200)
      .json({ status: "success", message: "Item updated successfully" });
  });
});

// Get spendings for the given month
app.get("/api/spendings/:user_id/:month", (req, res) => {
  let userId = req.params.user_id;
  let month = req.params.month;
  const sql = `SELECT prices FROM items WHERE user_id = ? AND MONTH(date) = ?`;
  db.query(sql, [userId, month], (err, results) => {
    if (err) {
      console.error("Error fetching items:", err);
      res
        .status(500)
        .json({ status: "error", message: "Error fetching items" });
      return;
    }
    let uniquePrices = [];
    let prices = results.forEach((item) =>
      item.prices.split(",").forEach((price) => uniquePrices.push(price))
    );
    let totalPrice = uniquePrices.reduce(
      (total, current) => Number(total) + Number(current),
      0
    );
    res.status(200).json({ status: "success", data: totalPrice });
  });
});

// Delete an item by ID
// app.delete("/items/:id", (req, res) => {
//   const itemId = req.params.id;
//   const sql = "DELETE FROM items WHERE id = ?";
//   db.query(sql, [itemId], (err) => {
//     if (err) {
//       console.error("Error deleting item:", err);
//       res.status(500).json({ error: "Error deleting item" });
//       return;
//     }
//     res.status(200).json({ message: "Item deleted successfully" });
//   });
// });

app.listen(PORT, (error) => {
  if (!error) {
    console.log(
      "Server is Successfully Running, and App is listening on port " + PORT
    );
  } else {
    console.log("Error occurred, server can't start", error);
  }
});

//SELECT * FROM items WHERE MONTH(date) = 8 AND YEAR(date) = 2023;
