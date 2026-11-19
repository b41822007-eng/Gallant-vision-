const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const axios = require('axios');
require('dotenv').config();
const app = express();
app.use(cors()); app.use(express.json({limit:'100mb'}));
const JWT_SECRET = process.env.JWT_SECRET || 'gallant-vision-secret';
const PORT = process.env.PORT || 10000;

// === DATABASE (In-memory for demo, badala yake tumia PostgreSQL kwenye Render) ===
let users = [], posts = [], payments = [], reports = [];
let books = [
  { id:1, title:'Academic Communication Form 5', price:5000, file:'/books/Form5.pdf', freeChapter:'Chapter 1 - Crafting Meaning' },
  { id:2, title:'Academic Communication Form 6', price:5000, file:'/books/Form6.pdf', freeChapter:'Chapter 1 - Grammar' }
];

// === M-PESA DARAJA - KWELI ===
async function getMpesaToken(){
  const key = process.env.MPESA_CONSUMER_KEY;
  const secret = process.env.MPESA_CONSUMER_SECRET;
  const auth = Buffer.from(`${key}:${secret}`).toString('base64');
  const res = await axios.get('https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials', { headers:{ Authorization:`Basic ${auth}` } });
  return res.data.access_token;
}
app.post('/api/pay/mpesa', async (req,res)=>{
  const { phone, bookId } = req.body;
  // Kama huna Daraja keys bado, tumia Demo
  if(!process.env.MPESA_CONSUMER_KEY) return res.json({ success:true, message:`DEMO: Check your phone ${phone}. Enter M-Pesa PIN to pay TSh 5,000.` });
  try{
    const token = await getMpesaToken();
    const timestamp = new Date().toISOString().replace(/[^0-9]/g,'').slice(0,14);
    const password = Buffer.from(`${process.env.MPESA_SHORTCODE}${process.env.MPESA_PASSKEY}${timestamp}`).toString('base64');
    const stk = await axios.post('https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
      { BusinessShortCode: process.env.MPESA_SHORTCODE, Password: password, Timestamp: timestamp, TransactionType:'CustomerPayBillOnline', Amount:5000, PartyA:phone, PartyB:process.env.MPESA_SHORTCODE, PhoneNumber:phone, CallBackURL:'https://gallant-vision-backend.onrender.com/api/pay/callback', AccountReference:`BOOK-${bookId}`, TransactionDesc:'Gallant Vision Book' },
      { headers:{ Authorization:`Bearer ${token}` } });
    payments.push({ phone, bookId, id: stk.data.CheckoutRequestID, status:'pending' });
    res.json({ success:true, message:'Check your phone. Enter M-Pesa PIN.', checkoutRequestId: stk.data.CheckoutRequestID });
  }catch(e){ res.status(500).json({ message:'M-Pesa failed. Try again. Error: '+e.message }); }
});
app.post('/api/pay/callback', (req,res)=>{ console.log('M-Pesa Callback:', JSON.stringify(req.body)); res.json({ ResultCode:0, ResultDesc:'Success' }); });

// === AUTH ===
app.post('/api/auth/register', async (req,res)=>{
  const { name, email, password, form } = req.body;
  if(users.find(u=>u.email===email)) return res.status(400).json({message:'Email already exists'});
  const hashed = await bcrypt.hash(password,10);
  const user = { id: users.length+1, name, email, form: form||'Form 5', password:hashed, role:'student', isVerified:false };
  users.push(user); const token = jwt.sign({id:user.id, email}, JWT_SECRET);
  res.json({ token, user:{ id:user.id, name, email, form:user.form } });
});
app.post('/api/auth/login', async (req,res)=>{
  const { email, password } = req.body;
  const user = users.find(u=>u.email===email);
  if(!user) return res.status(400).json({message:'User not found'});
  if(!await bcrypt.compare(password, user.password)) return res.status(400).json({message:'Wrong password'});
  const token = jwt.sign({id:user.id, email}, JWT_SECRET);
  res.json({ token, user:{ id:user.id, name:user.name, email, form:user.form } });
});

// === POSTS + UPLOAD VIDEO ===
app.get('/api/posts', (req,res)=> res.json(posts));
app.post('/api/posts', (req,res)=>{
  const { title, hashtag, videoUrl, form } = req.body;
  const post = { id: posts.length+1, title, hashtag, videoUrl: videoUrl||'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4', form, likes:0, createdAt:new Date(), reports:0 };
  posts.unshift(post); res.json(post);
});
app.post('/api/posts/:id/report', (req,res)=>{ const p=posts.find(x=>x.id==req.params.id); if(p) p.reports++; reports.push({ postId:req.params.id, reason:req.body.reason }); res.json({ message:'Reported. Admin will review in 24 hours.' }); });

// === SHOP ===
app.get('/api/books', (req,res)=> res.json(books));

// === ADMIN PANEL ===
app.get('/api/admin/stats', (req,res)=> res.json({ totalUsers: users.length, totalPosts: posts.length, totalSales: payments.length, totalRevenue: payments.length*5000, reports: reports.length }));
app.delete('/api/admin/posts/:id', (req,res)=>{ posts = posts.filter(p=>p.id!=req.params.id); res.json({ message:'Post deleted by Admin' }); });
app.post('/api/admin/ban/:userId', (req,res)=>{ users = users.filter(u=>u.id!=req.params.userId); res.json({ message:'User banned' }); });

app.get('/health', (req,res)=> res.json({ status:'OK', app:'Gallant Vision' }));
app.listen(PORT, ()=> console.log(`Gallant Vision Full Backend on ${PORT}`));
