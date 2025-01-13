require('dotenv').config()
const express = require('express')
const cors = require('cors')
const cookieParser = require('cookie-parser')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb')
const jwt = require('jsonwebtoken')
const morgan = require('morgan')
const nodemailer = require("nodemailer");

const port = process.env.PORT || 9000
const app = express()
// middleware
const corsOptions = {
  origin: ['http://localhost:5173', 'http://localhost:5174','http://localhost:5177'],
  credentials: true,
  optionSuccessStatus: 200,
}
app.use(cors(corsOptions))

app.use(express.json())
app.use(cookieParser())
app.use(morgan('dev'))

const verifyToken = async (req, res, next) => {
  const token = req.cookies?.token
console.log('from verify tokes',token)
  if (!token) {
    return res.status(401).send({ message: 'unauthorized access' })
  }
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {

      return res.status(401).send({ message: 'unauthorized access' })
    }
    req.user = decoded
    next()
  })
}

// send email using nodeMailer

const sendEmail=(emailAddress,emailData)=>{
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false, // true for port 465, false for other ports
    auth: {
      user: process.env.NODEMAILER_USER,
      pass: process.env.NODEMAILER_PASSWORD,
    },
  });
  transporter.verify((error,success)=>{
    if(error){
      console.log(err)
    }else{
      console.log('server is ready',success)
    }
  })
  // const{PlantId,price,quantity,}=emailData?.orderInfo
  const mailBody={
    from: '"Maddison Foo Koch 👻" <maddison53@ethereal.email>', // sender address
    to: emailAddress, // list of receivers
    subject: emailData?.Subject, // Subject line
    html: emailData?.message, // html body
  }

  transporter.sendMail(mailBody,(error,info)=>{
    if(error){
      console.log(error)
    }else{
      console.log(info)
      console.log('Email Sent:' + info?.response)
    }
  })
}

const uri = `mongodb+srv://${process.env.USER_KEY}:${process.env.PASSWORD_KEY}@cluster0.onkli.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`


// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
})
async function run() {
  try {

    // create collection
    const plantsCollection=client.db('plant_shop').collection('plants')
    const userCollection=client.db('plant_shop').collection('users')
    const orderCollection=client.db('plant_shop').collection('order')

// verify Admin
const verifyAdmin=async(req,res,next)=>{
  const email=req.user?.email;
  
  const query={email}
  const result=await userCollection.findOne(query)
  if(!result || result.role !=='Admin'){
    return res.status(403).send('cannot access without admin')
  }
  next()
}

// verify seller
const verifySeller=async(req,res,next)=>{
  const email=req.user?.email;
  
  const query={email}
  const result=await userCollection.findOne(query)
  if(!result || result.role !=='Seller'){
    return res.status(403).send('cannot access without seller')
  }
  next()
}

    // Generate jwt token
    app.post('/jwt', async (req, res) => {
      const email = req.body
      const token = jwt.sign(email, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: '365d',
      })
      res
        .cookie('token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
        })
        .send({ success: true })
    })
    // Logout
    app.get('/logout', async (req, res) => {
      try {
        res
          .clearCookie('token', {
            maxAge: 0,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
          })
          .send({ success: true })
      } catch (err) {
        res.status(500).send(err)
      }
    })

    // user create and collection
    app.post('/user/:email',async(req,res)=>{
      
      const email=req.params.email
      const user=req.body;
      const query={email}

      const isExist=await userCollection.findOne(query)
      if(isExist){
        return res.send(isExist)
      }
      const result=await userCollection.insertOne({
        ...user,
        role:'Customer',
       timeStamp:Date.now()
      })
      res.send(result)
    })

    // plants collection
    app.post('/plant',verifyToken,verifySeller,async(req,res)=>{
      const plants=req.body;
      const result=await plantsCollection.insertOne(plants,{role:'customer'})
      res.send(result)
    })

    // get plants data from plants collection
    app.get('/plant',async(req,res)=>{
      const result=await plantsCollection.find().toArray()
      res.send(result)
    })

    // get plant specific user
    app.get('/plants/:email',async(req,res)=>{
      const email=req.params.email;
      const query={'seller.email':email}
      const result=await plantsCollection.find(query).toArray()
      res.send(result)
    })

    // delet plant specific user by id

    app.delete('/plant/:id',verifyToken,verifySeller,async(req,res)=>{
      const id=req.params.id;
      const query={_id: new ObjectId(id)}
      const result=await plantsCollection.deleteOne(query)

      res.send(result)
    })
    // get one plant by id
    app.get('/plant/:id',async(req,res)=>{
      const id=req.params.id;
      const query={_id: new ObjectId(id)}
      const result=await plantsCollection.findOne(query)
      res.send(result)
    })

// manage user status
app.patch('/users/:email',async(req,res)=>{
  const email=req.params.email;
  const query={email}
  const user=await userCollection.findOne(query);
  if(!user || user?.status ==='Requested' )
    return res.status(404).send('You have already requested,Please wait untill response')
  const updateDoc={
    $set:{
      status:'Requested'
    }
  }
  const result=await userCollection.updateOne(query,updateDoc)
  res.send(result)
})

// get all users admin route
app.get('/all_user/:email',verifyToken,verifyAdmin,async(req,res)=>{
const email=req.params.email;
const query={email:{$ne:email}}
const result=await userCollection.find(query).toArray()
res.send(result)
})


// user role
app.get('/users/role/:email',async(req,res)=>{
  const email=req.params.email;
  const query={email};

  const result=await userCollection.findOne(query)
  res.send({role:result?.role})
})

// update user role
app.patch('/users/role/:email',verifyToken,async(req,res)=>{
  const email=req.params.email;
  const filter={email}
  const {role}=req.body;
  const updateDoc={
    $set:{role,status:'Verified'}
  }
  const result=await userCollection.updateOne(filter,updateDoc)
  res.send(result)
})

    // order related api
    // seller
app.get('/seller_order/:email',async(req,res)=>{
  const email=req.params.email;
  const query={seller:email}
  console.log('from seler_order',query)
  const result=await orderCollection.aggregate([
    {
      $match:query, //Match specefic customers data only by eamil
    },
    {
      $addFields:{
        PlantId:{$toObjectId:'$PlantId'} //conver plant id string field to objectId field
      }
    },
    {
      $lookup:{  //go to difference collection and look for data
        from:'plants', 
        localField:'PlantId', //local data that you want to match 
        foreignField:'_id', //Foreign field name of that same data
        as:'plantInfo', //return the data as plants array
      }
    },

    // convert object array of data &unwind   
    {
      $unwind:'$plantInfo'
    },

    // some data remove in plant info as for that  add filed
    {
      $addFields:{
        ImageName:'$plantInfo.name',
        Image:'$plantInfo.imgUrl',
        category:'$plantInfo.category',
      }
    },
    // specefic get data from plant info then remove plant info note: if 1 then give this data and remove another data, if 0 then remove this data and give another data
    {
      $project:{
        plantInfo:0,
      }
    }
   
  ])
  .toArray()
  res.send(result)
})

// order status changing 
app.patch('/seller_order/:id',verifyToken,verifySeller,async(req,res)=>{
  const id=req.params.id;
  const {status}=req.body;
  const query={_id:new ObjectId(id)}
  const updateDoc={
    $set:{status}
  }
  const result=await orderCollection.updateOne(query,updateDoc)
 res.send(result)
})

    app.post('/order',verifyToken,async(req,res)=>{
      const orderInfo=req.body;

      const result=await orderCollection.insertOne(orderInfo)
      if(result.insertedId){

        // for customer message
        sendEmail(orderInfo?.customerInfo?.email,{
          Subject:'Hurray!',
          message:`<div class="overflow-x-auto">
  <table class="table">
    <!-- head -->
    <thead>
      <tr>
    
        <th>PlantID</th>


        <th>price</th>



        <th>Quantity</th>

        <th>Transaction Id</th>
      </tr>
    </thead>
    <tbody>
      <!-- row 1 -->
      <tr>
     
        <td>
          ${orderInfo?.PlantId}
        </td>
        <td>
          $${orderInfo?.price}
        </td>
        <td>
       ${orderInfo?.quantity}
        </td>
        <td>
        ${result?.insertedId}
        </td>
     
      </tr>
    
    </tbody>
  </table>
</div>`
        })

        // for seller message
        sendEmail(orderInfo?.seller,{
          Subject:'Hurray!,You have an order process',
          message:`Get the plant ready for:${orderInfo?.customerInfo?.name}`
        })
      }

      res.send(result)
    })

    // update quantity
    app.patch('/plant/quantity/:id',verifyToken,async(req,res)=>{
      const id=req.params.id;
      const query={_id: new ObjectId(id)}
      const{quantityUpdate,status}=req.body;
     
   let updateDoc={
        $inc:{quantity: -quantityUpdate}
      }
      if(status==='increase'){
       updateDoc={
          $inc:{quantity: quantityUpdate}
        }
      }
      const result=await plantsCollection.updateOne(query,updateDoc)
      res.send(result)
    })

    // get order data 
    app.get('/order/:email',async(req,res)=>{
      const email=req.params.email;
    
      const query={"customerInfo.email":email}
      const result=await orderCollection.aggregate([
        {
          $match:query, //Match specefic customers data only by eamil
        },
        {
          $addFields:{
            PlantId:{$toObjectId:'$PlantId'} //conver plant id string field to objectId field
          }
        },
        {
          $lookup:{  //go to difference collection and look for data
            from:'plants', 
            localField:'PlantId', //local data that you want to match 
            foreignField:'_id', //Foreign field name of that same data
            as:'plantInfo', //return the data as plants array
          }
        },

        // convert object array of data &unwind   
        {
          $unwind:'$plantInfo'
        },

        // some data remove in plant info as for that  add filed
        {
          $addFields:{
            ImageName:'$plantInfo.name',
            Image:'$plantInfo.imgUrl',
            category:'$plantInfo.category',
          }
        },
        // specefic get data from plant info then remove plant info note: if 1 then give this data and remove another data, if 0 then remove this data and give another data
        {
          $project:{
            plantInfo:0,
          }
        }
       
      ])
      .toArray()
      res.send(result)
    })


    // delet order
    app.delete('/order/:id',verifyToken,async(req,res)=>{
      const id=req.params.id;
      const query={_id: new ObjectId(id)}
      const order=await orderCollection.findOne(query)
      if(order.status ==='Delivered'){
        return res.status(409).send('you cannot cancel because of this purcel havebeen delivered')
      }
      const result=await orderCollection.deleteOne(query)
      res.send(result)
    })


    // Send a ping to confirm a successful connection
    await client.db('admin').command({ ping: 1 })
    console.log(
      'Pinged your deployment. You successfully connected to MongoDB!'
    )
  } finally {
    // Ensures that the client will close when you finish/error
  }
}
run().catch(console.dir)

app.get('/', (req, res) => {
  res.send('Hello from plantNet Server..')
})

app.listen(port, () => {
  console.log(`plantNet is running on port ${port}`)
})
