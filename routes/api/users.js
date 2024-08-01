const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const keys = require("../../config/keys");

// Load input validation
const validateRegisterInput = require("../../validation/register");
const validateLoginInput = require("../../validation/login");

// Load User model
const User = require("../../models/UserSchema");

// @route POST api/users/register
// @desc Register user
// @access Public

router.post("/register", (req, res) => {
    
    //Form validation
    const {errors, isValid} = validateRegisterInput(req.body);
    
    if(!isValid){
        return res.status(400).json(errors);
    }

    User.findOne({email:req.body.email}).then(user=>{

        if(user){
            return res.status(400).json({email:"Email already exists"});
        } else{
            const newUser = new User({
                name:req.body.name,
                password:req.body.password,
                email:req.body.email
            });

            // Hash password before storing in database
            const rounds  = 10;
            bcrypt.genSalt(rounds, (err, salt) => {
                bcrypt.hash(newUser.password, salt, (err, hash) => {
                if (err) throw err;
                newUser.password = hash;
                newUser
                    .save()
                    .then(user => res.json(user))
                    .catch(err => console.log(err));
                });
            });
        }

    });

});

// @route POST api/users/login
// @desc Login user and return JWT token
// @access Public

router.get("/getUser", async(req, res) => {
    console.log(req.query.email)
    const query = User.findOne({ 'email': req.query.email});
    const person = await query.exec();
    res.send(person)
})

router.post("/login",(req,res) => {

    //Form Valdiation
    const {errors, isValid} = validateLoginInput(req.body);

    if (!isValid) {
        return res.status(400).json(errors);
    }

    const email = req.body.email;
    const password = req.body.password;
   
    //Find user by Email
    User.findOne({email}).then(user=>{
        if(!user){
            return res.status(404).json({ emailnotfound: "Email not found" });
        }

    // Check password
    bcrypt.compare(password, user.password).then(isMatch => {
        
        if (isMatch) {
            // Create JWT Payload
            console.log(user);
            const payload = {
                id: user.id,
                name: user.name,
                email: user.email,
                paymentStatus: user.paymentStatus
            };

            // Sign token
            jwt.sign(
                payload,
                keys.secretOrKey,
                {
                 expiresIn: 31556926 
                },
                (err, token) => {
                res.json({
                    success: true,
                    token: "Bearer " + token
                });
                }
            );
        } else {
          return res
            .status(400)
            .json({ passwordincorrect: "Password incorrect" });
        }
      });
    });
});

// router.get('/webhook', function(req, res, next) {
//     console.log("req body")
//     console.log('webhook received')
//     res.send('respond with a resource');
//   });
  
  router.post('/webhook', async function(req, res, next) {
    console.log("req body")
    console.log(req.body)
    let email = req.body.event.data.metadata.email
    const query = User.findOne({ 'email': email});
    const person = await query.exec();

    console.log('query is', person)
    let type = req.body.event.type
    const pricingAmount = req.body?.event?.data?.pricing?.local?.amount;
    const currentDate = new Date();

    let nextPaymentDueDate;

    if (pricingAmount === 0.01) {
    nextPaymentDueDate = new Date(currentDate);
    nextPaymentDueDate.setDate(currentDate.getDate() + 2);
    } else {
    nextPaymentDueDate = new Date(currentDate.setFullYear(currentDate.getFullYear() + 10));
    }

    console.log(nextPaymentDueDate);
// const nextPaymentDueDate = new Date(currentDate.setDate(currentDate.getDate() + 1));
    if(person){
        let res;
    switch(type) {
        case 'charge:confirmed':
            res = await User.updateOne({ email: email }, { paymentStatus: 'completed', nextPaymentDueDate:  nextPaymentDueDate});
            console.log('charge is confirmed')
            // code block
            break;
        case 'charge:pending':
            res = await User.updateOne({ email: email }, { paymentStatus: 'pending', nextPaymentDueDate:  nextPaymentDueDate});
            console.log('charge is pending')
            // code block
            break;
        case 'charge:created':
            // res = await User.updateOne({ email: email }, { paymentStatus: 'completed', nextPaymentDueDate:  nextPaymentDueDate});
            console.log('charge is initiated')
            // code block
            break;
        default:
            console.log("chrage failed")
            // code block
        }
    }
    // res.status(200).send('Webhook successfully received');
    res.redirect('http://localhost:3001/dashboard');
  });

module.exports = router;