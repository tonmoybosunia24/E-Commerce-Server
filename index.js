const express = require('express');
const app = express();
require('dotenv').config();
const cors = require('cors');
const jwt = require('jsonwebtoken')
const SSLCommerzPayment = require('sslcommerz-lts')
const PDFDocument = require('pdfkit');
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

// Middleware
app.use(express.json());
app.use(cors());

// MongoDB Connection
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.4vklw.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
       serverApi: {
              version: ServerApiVersion.v1,
              strict: false,
              deprecationErrors: false,
       }
});

// Ssl Commerce
const store_id = process.env.STORE_ID;
const store_passwd = process.env.STORE_PASS
const is_live = false //true for live, false for sandbox

async function run() {
       try {
              // Connect the client to the server (optional starting in v4.7)
              await client.connect();

              // MongoDb Database Collections
              const usersCollection = client.db("E-Commerce").collection("users");
              const productsCollection = client.db("E-Commerce").collection("products");
              const reviewsCollection = client.db("E-Commerce").collection("reviews");
              const blogsCollection = client.db("E-Commerce").collection("blogs");
              const cartsCollection = client.db("E-Commerce").collection("carts");
              const wishlistCollection = client.db("E-Commerce").collection("wishlists");
              const ordersCollection = client.db("E-Commerce").collection("orders");

              // Jwt Token Post To DataBase
              app.post('/jwt', async (req, res) => {
                     // Get The Users Email
                     const userEmail = req.body;
                     // Create A Jwt Token
                     const token = jwt.sign(userEmail, process.env.ACCESS_TOKEN_SECRET, {
                            expiresIn: '1h'
                     });
                     // Send The Token To FrontEnd
                     res.send({ token });
              });
              // Verify Token For Protected Routes Middleware
              const verifyToken = (req, res, next) => {
                     if (!req.headers.authorization) {
                            return res.status(401).send({ message: 'Unauthorized Access' });
                     }
                     const token = req.headers.authorization.split(' ')[1];
                     jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
                            if (err) {
                                   return res.status(401).send({ message: 'Unauthorized Access' })
                            }
                            req.decoded = decoded;
                            next();
                     })
              }
              // Verify Admin For Protected Routes Middleware
              const verifyAdmin = async (req, res, next) => {
                     // Get The Email From Jwt Token
                     const email = req.decoded?.email;
                     // Find The Email In MongoDb
                     const query = { email: email };
                     // Get The Email In MongoDb
                     const user = await usersCollection.findOne(query);
                     // Check The Email That Admin Or Not
                     const isAdmin = user?.role === 'Admin';
                     // If Not Admin Send A Status Message
                     if (!isAdmin) {
                            return res.status(403).send({ message: 'Forbidden Access' })
                     };
                     // Allow Permission For Go Next
                     next();
              }
              // Verify Moderator For Protected Routes Middleware
              const verifyModerator = async (req, res, next) => {
                     // Get The Email From Jwt Token
                     const email = req.decoded?.email;
                     // Find The Email In MongoDb
                     const query = { email: email };
                     // Get The Email In MongoDb
                     const user = await usersCollection.findOne(query);
                     // Check The Email That Admin/Moderator Or Not
                     const isModeratorOrAdmin = user?.role === 'Admin' || user?.role === 'Moderator';
                     // If Not Admin Or Moderator Send A Status Message
                     if (!isModeratorOrAdmin) {
                            return res.status(403).send({ message: 'Forbidden Access' })
                     };
                     // Allow Permission For Go Next
                     next();
              }
              // Get The Admin Stats Or Analytics
              app.get('/adminStats', verifyToken, verifyAdmin, async (req, res) => {
                     // Get The Total Users
                     const users = await usersCollection.estimatedDocumentCount();
                     // Get The Total Products
                     const products = await productsCollection.estimatedDocumentCount();
                     // Get The Total Orders
                     const orders = await ordersCollection.estimatedDocumentCount();
                     // Find The Total Revenue
                     const result = await ordersCollection.aggregate([
                            {
                                   $group: {
                                          _id: null,
                                          totalRevenue: { $sum: "$totalAmount" }
                                   }
                            }
                     ]).toArray();
                     // Get The Total Revenue
                     const totalRevenue = result.length > 0 ? result[0].totalRevenue : 0;
                     // Get The Total Revenue By Payment-Method
                     const statusWise = await ordersCollection.aggregate([
                            {
                                   $group: {
                                          _id: "$paymentMethod",
                                          totalRevenue: { $sum: "$totalAmount" },
                                          totalOrders: { $sum: 1 }
                                   }
                            }
                     ]).toArray();
                     // Send The Result To Frontend
                     res.send({ totalRevenue, users, products, orders, statusWise })
              })
              // Get The Admin Chart Data
              app.get('/adminChartData', verifyToken, verifyAdmin, async (req, res) => {
                     try {
                            // Get The Monthly Sales Report (6 Months)
                            const monthlySales = await ordersCollection.aggregate([
                                   {
                                          $group: {
                                                 _id: {
                                                        year: { $year: { $toDate: "$placeAt" } },
                                                        month: { $month: { $toDate: "$placeAt" } }
                                                 },
                                                 totalRevenue: { $sum: "$totalAmount" },
                                                 totalOrders: { $sum: 1 }
                                          }
                                   },
                                   { $sort: { "_id.year": 1, "_id.month": 1 } },
                                   { $limit: 6 }
                            ]).toArray();
                            // Get The Payment Method Report
                            const paymentMethods = await ordersCollection.aggregate([
                                   {
                                          $group: {
                                                 _id: "$paymentMethod",
                                                 totalRevenue: { $sum: "$totalAmount" },
                                                 totalOrders: { $sum: 1 }
                                          }
                                   }
                            ]).toArray();
                            // Get The ORder Distribution Report
                            const orderStatus = await ordersCollection.aggregate([
                                   {
                                          $group: {
                                                 _id: "$orderStatus",
                                                 totalOrders: { $sum: 1 }
                                          }
                                   }
                            ]).toArray();
                            // Send The Result To Frontend
                            res.send({ monthlySales, paymentMethods, orderStatus });
                     } catch (error) {
                            res.status(500).send({ message: "Something went wrong" });
                     }
              });
              // Get Admin Data From DataBase
              app.get('/admin/:email', verifyToken, async (req, res) => {
                     // Get The Users Email
                     const email = req.params.email;
                     // Check The Email Verification
                     if (email !== req.decoded?.email) {
                            return res.status(403).send({ message: 'Unauthorized Access' })
                     }
                     // Find The Email From MongoDb
                     const query = { email: email }
                     // Get The User From MongoDb
                     const user = await usersCollection.findOne(query);
                     // Check The User That Admin Or Not
                     let Admin = false;
                     if (user) {
                            Admin = user?.role === 'Admin'
                     }
                     // Send This Data To FrontEnd
                     res.send({ Admin });
              });
              // Get Moderator Data From DataBase
              app.get('/moderator/:email', verifyToken, async (req, res) => {
                     // Get The Users Email
                     const email = req.params.email;
                     if (email !== req.decoded?.email) {
                            return res.status(403).send({ message: 'Unauthorized Access' });
                     }
                     // Find The Email From MongoDb
                     const query = { email: email };
                     // Get The User From MongoDb
                     const user = await usersCollection.findOne(query);
                     // Check The User That Moderator Or Not
                     let Moderator = false;
                     if (user) {
                            Moderator = user?.role === 'Moderator'
                     };
                     // Send This Data To FrontEnd
                     res.send({ Moderator })
              })
              // Post Users Data To DataBase
              app.post('/users', async (req, res) => {
                     // Get The Users Data
                     const user = req.body;
                     // Sent Users Data To MongoDb
                     const result = usersCollection.insertOne(user);
                     // Sent The Response To FrontEnd
                     res.send(result);
              })
              // Get Single User From Database
              app.get('/users/:email', async (req, res) => {
                     const email = req.params.email;
                     const query = { email: email };
                     const result = await usersCollection.findOne(query);
                     res.send(result);
              })
              // Update Single User Data From DataBase
              app.patch('/updateUserInfo/:id', async (req, res) => {
                     // Get The User Id
                     const id = req.params.id;
                     // Get The Update User Data
                     const updatedUserInfo = req.body;
                     // Find The Id From DataBase
                     const filter = { _id: new ObjectId(id) };
                     // Set The Updated Data
                     const updateDoc = {
                            $set: updatedUserInfo,
                     };
                     // Set The Updated User Data To DataBase
                     const result = await usersCollection.updateOne(filter, updateDoc);
                     // Send The Result To FrontEnd
                     res.send(result);
              })
              // Get Users Data From DataBase
              app.get('/users', async (req, res) => {
                     // Get The Search Input
                     const search = req.query.search || '';
                     // Define Query
                     let query = {};
                     // Add Search Filter
                     if (search && search.trim() !== '') {
                            query.$or = [
                                   { email: { $regex: search.trim(), $options: 'i' } },
                                   { name: { $regex: search.trim(), $options: 'i' } }
                            ]
                     }
                     // Find Users Form MongoDb
                     const users = await usersCollection.find(query).toArray();
                     // Send Data To FrontEnd
                     res.send(users);
              });
              // Delete Users Form DataBase
              app.delete('/users/:id', async (req, res) => {
                     const id = req.params.id;
                     const query = { _id: new ObjectId(id) };
                     const result = await usersCollection.deleteOne(query);
                     res.send(result);
              })
              // Update User Role From DataBase
              app.patch('/users/:id', async (req, res) => {
                     // Get The User Id From FrontEnd
                     const id = req.params.id;
                     // Get The Role From FrontEnd
                     const { role } = req.body;
                     // FInd The User From MongoDb
                     const filter = { _id: new ObjectId(id) };
                     // Find What To Update
                     const updateDoc = {
                            $set: {
                                   role: role,
                            },
                     };
                     // Update The Request Users Role
                     const result = await usersCollection.updateOne(filter, updateDoc)
                     // Send Result To FrontEnd
                     res.send(result)
              })
              // Post Product Data To DataBase
              app.post('/products', verifyToken, verifyModerator, async (req, res) => {
                     // Get The Product Data 
                     const product = req.body;
                     // Send Product Data To MongoDb
                     const result = productsCollection.insertOne(product);
                     // Sent The Response To FrontEnd
                     res.send(result);
              })
              // Get Admin Or Moderator Products
              app.get('/adminProducts', verifyToken, verifyModerator, async (req, res) => {
                     // Get The Search Input
                     const search = req.query.search || '';
                     // Add Query For Stop Unwanted Products
                     const query = { Title: { $exists: true, $ne: '' } };
                     // Add search filter
                     if (search && search.trim() !== '') {
                            query.$or = [
                                   { Title: { $regex: search.trim(), $options: 'i' } },
                                   { Category: { $regex: search.trim(), $options: 'i' } },
                                   { SubCategory: { $regex: search.trim(), $options: 'i' } },
                                   { Brand: { $regex: search, $options: 'i' } },
                            ];
                     }
                     // Find Products From MongoDb
                     const products = await productsCollection.find(query).toArray();
                     // Result Send To DataBase
                     res.send(products)
              })
              // Delete Product From DataBase
              app.delete('/products/:id', verifyToken, verifyModerator, async (req, res) => {
                     // Get The Carts Id
                     const id = req.params.id;
                     // Find Id In MongoDb
                     const query = { _id: new ObjectId(id) };
                     // Send Data For Delete Card
                     const result = await productsCollection.deleteOne(query);
                     // Send Delete Result To FrontEnd
                     res.send(result);
              })
              // Get Single Product For Update
              app.get('/updateProducts/:id', verifyToken, verifyModerator, async (req, res) => {
                     // Get The Update Product Id
                     const id = req.params.id;
                     // Object Id Validation
                     if (!ObjectId.isValid(id)) {
                            return res.status(400).send({ error: 'Invalid product ID' });
                     }
                     // Find Single Update Product Form Id
                     const product = await productsCollection.findOne({ _id: new ObjectId(id) })
                     // Send Data To FrontEnd
                     res.send(product)
              })
              app.patch('/updateProducts/:id', verifyToken, verifyModerator, async (req, res) => {
                     // Get The Product Id
                     const id = req.params.id;
                     // Get The Updated Product
                     const product = req.body;
                     // Find The Product Id Form DataBase
                     const filter = { _id: new ObjectId(id) };
                     // Set The Updated Product In DataBase
                     const updateDoc = {
                            $set: product,
                     }
                     // Update Updated Product In DataBase
                     const result = await productsCollection.updateOne(filter, updateDoc)
                     // Send Data To FrontEnd
                     res.send(result)
              })
              // Get Query Products
              app.get('/products', async (req, res) => {
                     // Pagination For Products
                     const page = parseInt(req.query.page) || 1;
                     const limit = parseInt(req.query.limit) || 12;
                     const skip = (page - 1) * limit;
                     // Search For Products
                     const search = req.query.search || '';
                     // Sorting For Products
                     const sort = req.query.sort || 'name-asc'
                     const sortMap = { 'name-asc': { Title: 1 }, 'name-desc': { Title: -1 }, 'price-asc': { Price: 1 }, 'price-desc': { Price: -1 } };
                     const sortOption = sortMap[sort];
                     // Query For Stop Sending Unwanted Products
                     const query = { Title: { $exists: true, $ne: '' } };
                     // Add search filter
                     if (search && search.trim() !== '') {
                            query.$or = [
                                   { Title: { $regex: search.trim(), $options: 'i' } },
                                   { Category: { $regex: search.trim(), $options: 'i' } },
                                   { SubCategory: { $regex: search.trim(), $options: 'i' } },
                                   { Brand: { $regex: search, $options: 'i' } },
                            ];
                     }
                     // Filters For Products Availability
                     if (req.query.availability) {
                            const availabilityValues = req.query.availability.split(',');
                            query.AvailabilityStatus = { $in: availabilityValues };
                     }
                     // Filters For Products Size
                     if (req.query.size) {
                            const sizeValues = req.query.size.split(',');
                            query.Variant = { $in: sizeValues };
                     }
                     // Filters For Products Color
                     if (req.query.color) {
                            const colorValues = req.query.color.split(',');
                            query.Colors = { $in: colorValues };
                     }
                     // Filters For Products Price Slider
                     if (req.query.minPrice && req.query.maxPrice) {
                            query.Price = { $gte: Number(req.query.minPrice), $lte: Number(req.query.maxPrice) };
                     }
                     // Filters For Products Brands
                     if (req.query.brands) {
                            const brandsValues = req.query.brands.split(',');
                            query.Brand = { $in: brandsValues }
                     }
                     // Filter For Products Category
                     if (req.query.category) {
                            const categoryValues = req.query.category.split(',');
                            query.Category = { $in: categoryValues };
                     }
                     // Dynamic Counts For Size
                     const sizeOptions = ['S', 'M', 'L', 'XL', 'XXL'];
                     const sizeCounts = {};
                     for (const size of sizeOptions) {
                            sizeCounts[size] = await productsCollection.countDocuments({
                                   Variant: { $in: [size] }
                            });
                     }
                     // Dynamic Counts For Availability
                     const availabilityOptions = ['In Stock', 'Limited Stock', 'Not Available'];
                     const availabilityCounts = {};
                     for (const status of availabilityOptions) {
                            availabilityCounts[status] = await productsCollection.countDocuments({ AvailabilityStatus: status });
                     }
                     // Dynamic Counts For Colors
                     const colorOptions = ['#FF0000', '#000000', '#FFFFFF', '#CCCCCC'];
                     const colorCounts = {};
                     for (const color of colorOptions) {
                            colorCounts[color] = await productsCollection.countDocuments({ Colors: color });
                     }
                     // Dynamic Counts For Brand
                     const brandsOptions = ['Apple', 'Samsung', 'Sony', 'Nike'];
                     const brandsCounts = {};
                     for (const brands of brandsOptions) {
                            brandsCounts[brands] = await productsCollection.countDocuments({ Brand: brands });
                     }
                     // All Products Sending To FrontEnd
                     const allProducts = await productsCollection.find(query).sort(sortOption).skip(skip).limit(limit).toArray();
                     const total = await productsCollection.countDocuments(query)
                     res.send({ allProducts, totalPages: Math.ceil(total / limit), currentPage: page, limit, counts: { size: sizeCounts, availability: availabilityCounts, color: colorCounts, brands: brandsCounts } });
              })
              // Get Single Product With Related Products
              app.get('/productDetails/:id', async (req, res) => {
                     // Get The Id 
                     const id = req.params.id;
                     // Object Id Validation
                     if (!ObjectId.isValid(id)) {
                            return res.status(400).send({ error: 'Invalid product ID' });
                     }
                     // Find Single Product Form Id
                     const product = await productsCollection.findOne({ _id: new ObjectId(id) })
                     // Find Related Products From Single Product Category
                     const relatedProducts = await productsCollection.find({
                            Category: { $regex: new RegExp(`^${product.Category?.trim()}$`, 'i') },
                            _id: { $ne: new ObjectId(id) }
                     }).limit(10).toArray();
                     // Sending Single Product And Related Product To FrontEnd
                     res.send({ product, relatedProducts });
              })
              // Post Orders To DataBase
              app.post('/orders', async (req, res) => {
                     // Find Order Info From FrontEnd
                     const orderInfo = req.body;
                     // Create A New Object Id
                     const tran_id = new ObjectId().toString();
                     // Checking Payment Method CashOnDelivery Or Not
                     if (orderInfo.paymentMethod === 'CashOnDelivery') {
                            // Add OrderInfo To DataBase
                            const result = await ordersCollection.insertOne(orderInfo);
                            // Send Result To FrontEnd
                            return res.send(result);
                     };
                     // Setup Data To SSl Commerce
                     const data = {
                            total_amount: orderInfo?.totalAmount,
                            currency: 'BDT',
                            tran_id: tran_id,
                            success_url: `http://localhost:5000/payment/success/${tran_id}`,
                            fail_url: `http://localhost:5000/payment/fail/${tran_id}`,
                            cancel_url: 'http://localhost:3030/cancel',
                            ipn_url: 'http://localhost:3030/ipn',
                            shipping_method: 'Courier',
                            product_name: 'Computer.',
                            product_category: 'Electronic',
                            product_profile: 'general',
                            cus_name: orderInfo?.name,
                            cus_email: orderInfo?.email,
                            cus_add1: orderInfo?.address,
                            cus_add2: 'Dhaka',
                            cus_city: 'Dhaka',
                            cus_state: 'Dhaka',
                            cus_postcode: orderInfo?.postCode || '',
                            cus_country: 'Bangladesh',
                            cus_phone: orderInfo?.phoneNumber,
                            cus_fax: '01711111111',
                            ship_name: orderInfo?.name,
                            ship_add1: 'Dhaka',
                            ship_add2: 'Dhaka',
                            ship_city: 'Dhaka',
                            ship_state: 'Dhaka',
                            ship_postcode: 1000,
                            ship_country: 'Bangladesh',
                     };
                     const sslcz = new SSLCommerzPayment(store_id, store_passwd, is_live)
                     sslcz.init(data).then(apiResponse => {
                            // Create Gateway Url Link
                            let GatewayPageURL = apiResponse.GatewayPageURL
                            // Send Redirect Link To FrontEnd
                            res.send({ url: GatewayPageURL })
                            // Create Confirm Order Info
                            const confirmOrder = {
                                   firstName: orderInfo?.firstName,
                                   lastName: orderInfo?.lastName,
                                   name: orderInfo?.name,
                                   email: orderInfo?.email,
                                   phoneNumber: orderInfo?.phoneNumber,
                                   address: orderInfo?.address,
                                   city: orderInfo?.city,
                                   division: orderInfo?.division,
                                   country: orderInfo?.country,
                                   postCode: orderInfo?.postCode || '',
                                   paymentMethod: orderInfo?.paymentMethod,
                                   paymentStatus: "Pending",
                                   transactionId: tran_id,
                                   orderItems: orderInfo?.orderItems || [],
                                   subTotal: orderInfo?.subTotal,
                                   taxAmount: orderInfo?.taxAmount,
                                   totalAmount: orderInfo?.totalAmount,
                                   orderStatus: "Pending",
                                   deliveryStatus: "Pending",
                                   placeAt: new Date().toISOString()
                            };
                            // Add Final Order Info To Database
                            const result = ordersCollection.insertOne(confirmOrder);
                     });
              })
              // Payment Success Url
              app.post('/payment/success/:tranId', async (req, res) => {
                     // Get The Tran Id From Params
                     const tranId = req.params.tranId;
                     // Update Product Payment & Order Status
                     const result = await ordersCollection.findOneAndUpdate({ transactionId: tranId }, { $set: { paymentStatus: 'Paid', orderStatus: "Confirmed" } }, { returnDocument: "after" });
                     // Get The Result
                     if (result) {
                            // Get The Order Id From Result
                            const orderId = result?._id?.toString();
                            // Redirect To Checkout Page & Send Order Id In Params
                            res.redirect(`http://localhost:5173/checkOut?success=${orderId}`);
                     }
              });
              // Payment Fail Url
              app.post('/payment/fail/:tranId', async (req, res) => {
                     // Get The Tran Id From Params
                     const tranId = req.params.tranId;
                     // Delete Confirm Order When Order Fail
                     const result = await ordersCollection.deleteOne({ "transactionId": tranId });
                     // Check The Result
                     if (result.deletedCount > 0) {
                            // Redirect To Checkout Page & Send Fail Params
                            res.redirect(`http://localhost:5173/checkOut?failed=true`)
                     }
              });
              // Create Invoice Api
              app.get('/invoice/:orderId', async (req, res) => {
                     try {
                            const orderId = req.params.orderId;
                            const order = await ordersCollection.findOne({ _id: new ObjectId(orderId) });
                            if (!order) return res.status(404).send('Order not found');
                            const doc = new PDFDocument({ margin: 50 });
                            res.setHeader('Content-Type', 'application/pdf');
                            res.setHeader('Content-Disposition', `attachment; filename=invoice_${orderId}.pdf`);
                            doc.pipe(res);
                            const themeColor = "#ff5252"; // 🎨 Theme color
                            const lightBg = "#F5F0F0";    // Light shade for table rows / box
                            const pageWidth = doc.page.width; // ✅ dynamic width
                            // ====== HEADER BAR ======
                            doc.rect(0, 0, pageWidth, 80).fill(themeColor);
                            doc.fillColor("#FFF").fontSize(22).text("Classy Shop", 50, 30);
                            doc.fontSize(18).fillColor("#FFF").text("INVOICE", 0, 30, { align: "right" });
                            doc.moveDown(3);
                            // ====== INVOICE META ======
                            doc.fontSize(10).fillColor("#333");
                            doc.text(`Invoice ID: ${orderId}`, 50, 100);
                            doc.text(`Date: ${new Date().toLocaleDateString()}`, 50, 115);
                            // ====== CUSTOMER & SELLER INFO ======
                            doc.roundedRect(50, 140, 230, 100, 5).stroke(themeColor);
                            doc.roundedRect(320, 140, 230, 100, 5).stroke(themeColor);
                            doc.fontSize(12).fillColor(themeColor).text("Bill To:", 60, 150);
                            doc.fillColor("#000").fontSize(11)
                                   .text(order.name, 60, 170)
                                   .text(order.email, 60, 185)
                                   .text(order.phoneNumber, 60, 200)
                                   .text(`${order.address}, ${order.city}`, 60, 215);

                            doc.fillColor(themeColor).fontSize(12).text("Seller Info:", 330, 150);
                            doc.fillColor("#000").fontSize(11)
                                   .text("Classy Shop Ltd.", 330, 170)
                                   .text("mdtonmoybosunia24@gmail.com", 330, 185)
                                   .text("+8801780259656", 330, 200)
                                   .text("Dinajpur, Bangladesh", 330, 215);

                            // ====== ORDER ITEMS TABLE ======
                            let y = 270;
                            // Header Row
                            doc.rect(50, y, pageWidth - 100, 25).fill(themeColor);
                            doc.fillColor("#FFF").fontSize(11)
                                   .text("Product", 60, y + 7)
                                   .text("Qty", 300, y + 7, { width: 50, align: "center" })
                                   .text("Price", 370, y + 7, { width: 80, align: "right" })
                                   .text("Total", 460, y + 7, { width: 80, align: "right" });

                            y += 25;
                            // Rows with zebra striping
                            order.orderItems.forEach((item, idx) => {
                                   if (idx % 2 === 0) {
                                          doc.rect(50, y, pageWidth - 100, 20).fill(lightBg);
                                   } else {
                                          doc.rect(50, y, pageWidth - 100, 20).fill("#FFF");
                                   }
                                   doc.fillColor("#000").fontSize(10);
                                   doc.text(item.productName, 60, y + 5);
                                   doc.text(item.quantity, 300, y + 5, { width: 50, align: "center" });
                                   doc.text(`${item.price} BDT`, 370, y + 5, { width: 80, align: "right" });
                                   doc.text(`${item.price * item.quantity} BDT`, 460, y + 5, { width: 80, align: "right" });
                                   y += 20;
                            });
                            // ====== TOTALS BOX ======
                            y += 15;
                            doc.roundedRect(330, y, 220, 70, 5).fill(lightBg);
                            let boxX = 330;
                            let boxW = 220;
                            doc.fontSize(11).fillColor("#000");
                            // Subtotal
                            doc.text("Subtotal:", boxX + 10, y + 10, { align: "left" });
                            doc.text(`${order.subTotal} BDT`, boxX + 10, y + 10, { width: boxW - 20, align: "right" });
                            // Tax
                            doc.text("Tax:", boxX + 10, y + 25, { align: "left" });
                            doc.text(`${order.taxAmount} BDT`, boxX + 10, y + 25, { width: boxW - 20, align: "right" });
                            // Grand Total
                            doc.fontSize(12).fillColor(themeColor);
                            doc.text("Total (Tax Incl.):", boxX + 10, y + 45, { align: "left" });
                            doc.text(`${order.totalAmount} BDT`, boxX + 10, y + 45, { width: boxW - 20, align: "right" });
                            // ====== FOOTER ======
                            doc.moveDown(4);
                            doc.strokeColor(lightBg).lineWidth(1).moveTo(50, 700).lineTo(pageWidth - 50, 700).stroke();
                            doc.fontSize(10).fillColor("#666").text("Thank you For Shopping With Classy Shop", 0, 710, { align: "center" });
                            doc.text("For Support Contact: mdtonmoybosunia24@gmail.com", 0, 725, { align: "center" });
                            doc.end();

                     } catch (err) {
                            console.error(err);
                            if (!res.headersSent) {
                                   res.status(500).send('Server Error');
                            }
                     }
              });
              // Get All Category 
              app.get('/categories', async (req, res) => {
                     // Find All Category
                     const categories = await productsCollection.distinct("Category");
                     // Send Category To FrontEnd
                     res.send(categories);
              })
              // Get Category Products
              app.get('/categoryProducts', async (req, res) => {
                     const query = req.query; /* ----------Query For String To Object---------- */
                     // Find The Category Paramiter
                     const booleanFields = ['isNewArrival', 'isBestSeller', 'isOnSale']
                     booleanFields.forEach(field => {
                            if (query[field] !== undefined) {
                                   query[field] = query[field] === 'true';
                            }
                     })
                     // Find The Category Products
                     const products = await productsCollection.find(query).limit(10).toArray();
                     // Send Category Products To FrontEnd 
                     res.send(products);
              });
              // Get All Reviews
              app.get('/reviews', async (req, res) => {
                     // Find ALl The Reviews
                     const reviews = await reviewsCollection.find().toArray();
                     // Send Reviews Products To FrontEnd 
                     res.send(reviews);
              })
              // Get All Blogs
              app.get('/blogs', async (req, res) => {
                     // Get The Limit
                     const limit = parseInt(req.query.limit) || 6;
                     // Get The Total Blogs Length
                     const totalBlogs = await blogsCollection.countDocuments();
                     // Find ALl The Blogs
                     const blogs = await blogsCollection.find().limit(limit).toArray();
                     // Send Blogs To FrontEnd
                     res.send({ blogs, totalBlogs });
              })
              // Get Single Blog
              app.get('/singleBLog/:id', async (req, res) => {
                     // Get The Id
                     const id = req.params.id;
                     // Find The Id In DataBase
                     const query = { _id: new ObjectId(id) }
                     // Find The Blog From DataBase
                     const result = await blogsCollection.find(query).toArray();
                     // Send The Result To FrontEnd
                     res.send(result)
              })
              // Get Users Carts Data
              app.get('/carts', verifyToken, async (req, res) => {
                     // Get The User Email
                     const email = req.query.email;
                     // Find Users Email To MongoDb
                     const query = { email: email };
                     const result = await cartsCollection.find(query).toArray();
                     // Send Carts To FrontEnd
                     res.send(result);
              })
              // Post Carts Data To DataBase
              app.post('/carts', verifyToken, async (req, res) => {
                     // Get The Cards Data
                     const carts = req.body;
                     // Sent Users Data To MongoDb
                     const result = await cartsCollection.insertOne(carts);
                     // Sent The Response To FrontEnd
                     res.send(result);
              })
              // Update Quantity Form Carts
              app.patch('/carts/:id', async (req, res) => {
                     // Get The Users Id
                     const id = req.params.id;
                     // Get The Items Quantity
                     const { quantity } = req.body;
                     // Find Id In MongoDb
                     const filter = { _id: new ObjectId(id) };
                     // Find Quantity In MongoDb
                     const updateDoc = {
                            $set: {
                                   Quantity: quantity,
                            },
                     };
                     // Send Data For Update Quantity
                     const result = await cartsCollection.updateOne(filter, updateDoc);
                     // Send Update Quantity To FrontEnd
                     res.send(result)
              })
              // Delete Users Cart Data
              app.delete('/carts/:id', async (req, res) => {
                     // Get The Carts Id
                     const id = req.params.id;
                     // Find Id In MongoDb
                     const query = { _id: new ObjectId(id) };
                     // Send Data For Delete Card
                     const result = await cartsCollection.deleteOne(query);
                     // Send Delete Result To FrontEnd
                     res.send(result);
              })
              // Delete Full Users Cart Data
              app.delete('/userCarts/:email', async (req, res) => {
                     // Get The User Email
                     const email = req.params.email;
                     // Find The Email In DataBase
                     const query = { email: email }
                     // Delete Carts Data By User Email
                     const result = await cartsCollection.deleteMany(query)
                     // Send Result To Frontend
                     res.send(result);
              })
              // Post WishList Data To DataBase
              app.post('/wishlist', verifyToken, async (req, res) => {
                     // Get The WishList Product
                     const wishListProduct = req.body;
                     // Send WishList Data To MongoDb
                     const result = await wishlistCollection.insertOne(wishListProduct);
                     // Send The Response To FrontEnd
                     res.send(result);
              })
              // Get Wishlist Data From DataBase
              app.get('/wishlist', verifyToken, async (req, res) => {
                     // Get The User Email
                     const email = req.query.email;
                     // Find User Email In Mongodb
                     const query = { email: email };
                     // Find WishList Product Base On Email
                     const result = await wishlistCollection.find(query).toArray();
                     // Send Data To FrontEnd
                     res.send(result)
              })
              // Delete User Wishlist Data From DatabBase
              app.delete('/wishlist/:id', async (req, res) => {
                     // Get Product Id
                     const id = req.params.id;
                     // Find Product Id Form Database
                     const query = { _id: new ObjectId(id) }
                     // Delete Requested Product 
                     const result = await wishlistCollection.deleteOne(query);
                     // Send Result To FrontEnd
                     res.send(result);
              });
              // Get User Orders Data From DataBase
              app.get('/userOrder', async (req, res) => {
                     // Get The User Email
                     const email = req.query.email;
                     // Find The Email From DataBase
                     const query = { email: email }
                     // Get User Order Data From DataBase
                     const result = await ordersCollection.find(query).sort({ placeAt: -1 }).toArray();
                     // Send Ta Result To FrontEnd
                     res.send(result);
              })
              // Get Orders Data From DataBase
              app.get('/orders', verifyToken, verifyModerator, async (req, res) => {
                     // Get The Search Query
                     const search = req.query.search || ''
                     // Get Query For For Order Sorting
                     const query = {}
                     // Set Search Result In Query
                     if (search && search.trim() !== '') {
                            query.$or = [
                                   { name: { $regex: search, $options: 'i' } },
                                   { 'orderItems.productName': { $regex: search, $options: 'i' } },
                                   { paymentMethod: { $regex: search, $options: "i" } },
                            ]
                     }
                     // Get The Pages From Frontend
                     const page = parseInt(req.query.page) || 1;
                     // Get The Order Limit From Frontend
                     const limit = parseInt(req.query.limit) || 12;
                     // Skip For Orders By Page
                     const skip = (page - 1) * limit;
                     // Find Orders From DataBase
                     const orders = await ordersCollection.find(query).sort({ placeAt: -1 }).skip(skip).limit(limit).toArray();
                     // Get The Total Order Counts
                     const totalOrders = await ordersCollection.countDocuments(query);
                     // Send The Result For DataBase
                     res.send({ orders, totalPages: Math.ceil(totalOrders / limit), currentPage: page, limit, totalOrders });
              });
              // Update Orders Status From Database
              app.patch('/orders/:id', verifyToken, verifyModerator, async (req, res) => {
                     // Get The Id From Database
                     const id = req.params.id;
                     // Get The Update Data From Database
                     const updatedData = req.body;
                     // Find Id In Database
                     const filter = { _id: new ObjectId(id) }
                     // Set Updated Data
                     const updateDoc = { $set: updatedData };
                     // Update Data In Database
                     const result = await ordersCollection.updateOne(filter, updateDoc)
                     // Send Update Result To Frontend
                     res.send(result)
              })
              // Send a ping to confirm a successful connection
              await client.db("admin").command({ ping: 1 });
              console.log("Pinged your deployment. You successfully connected to MongoDB!");
       } finally {
              // Ensures that the client will close when you finish/error
              //   await client.close();
       }
}
run().catch(console.dir);

app.get('/', (req, res) => {
       res.send('E-Commerce-Server Is Running');
})

app.listen(port, () => {
       console.log(`Server is running on port ${port}`);
})