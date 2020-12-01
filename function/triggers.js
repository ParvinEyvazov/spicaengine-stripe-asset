const fetch = require("node-fetch");
//import * as Bucket from "@spica-devkit/bucket";
const Bucket = require("@spica-devkit/bucket");
//const STRIPE_TEST = process.env.STRIPE_TEST;
let traceID;
async function __construct() {
    traceID = Math.random() * 10000000;
}

const stripe = require("stripe")(
    "sk_test_51HX02AHC6Fal1mUZK1ATpv6YoxpWFR4S2csyiAoxBjWR26cHCcZQ2fi1RTspaZhEVPegHTMk2JjeWeBtcc41EPHP00JNfXpvt9"
);

//CONSTS
const url = process.env.__INTERNAL__SPICA__PUBLIC_URL__;
//const SECRET_API_KEY = process.env.SECRET_API_KEY;
const SECRET_API_KEY = "ajjbym18ki4asz2m";
const MARKET_BUCKET_ID = process.env.MARKET_BUCKET_ID;
//const CUSTOMER_BUCKET_ID = process.env.CUSTOMER_BUCKET_ID;
const CUSTOMER_BUCKET_ID = "5fc49f8ae33425002ce4a855";
//const PAYMENT_METHOD_ID = process.env.PAYMENT_METHOD_ID;
const PAYMENT_METHOD_ID = "5fc4a1d7e33425002ce4a859";
const PAYMENT_BUCKET_ID = "5fc4be43e33425002ce4a937";
const PRODUCT_BUCKET_ID = "5fc4eecde33425002ce4a9a0";
const PLAN_BUCKET_ID = "5fc4f49ae33425002ce4a9b2";

export async function payment(action) {
    //get data
    const data = action.current;
    Bucket.initialize({ apikey: `${SECRET_API_KEY}` });

    const payment_array = await Bucket.data.getAll(`${PAYMENT_BUCKET_ID}`, {
        queryParams: {
            filter: {
                _id: data._id
            },
            relation: true
        }
    });
    console.log(payment_array);
    const payment = payment_array[0];

    //stripe operations
    switch (payment.payment_type) {
        case "subscribe":
            await subscribe(data, payment);
            break;
        case "invoice":
            await invoice(payment);
            break;
        case "charge":
            await charge(data, payment);

            break;
        default:
            break;
    }
}

export async function charge(payment_bucket_data, payment) {
    Bucket.initialize({ apikey: `${SECRET_API_KEY}` });
    const { price, currency, token } = payment;

    const amount = price * 100;

    await stripe.charges
        .create({
            amount: amount,
            currency: currency,
            description: "Example charge",
            source: token,
            statement_descriptor: "Custom descriptor"
        })
        .then(data => {
            payment_bucket_data.status = "done";

            console.log("SUCCESSFULLY PAID", data, " on payment: ", payment);
        })
        .catch(error => {
            payment_bucket_data.status = "error";
            console.log("ERROR WHILE PAYING", error, " on payment: ", payment);
        });

    await Bucket.data
        .update(`${PAYMENT_BUCKET_ID}`, payment_bucket_data._id, payment_bucket_data)
        .then(_ => {
            console.log("Database updated", _);
        });
}

export async function invoice(payment) {
    console.log("INVOICE", payment);
}

export async function subscribe(payment_bucket_data, payment) {
    await stripe.subscriptions
        .create({
            customer: payment.customer.stripe_customer_id,
            items: [{ plan: payment.plan.price_id }],
            default_payment_method: payment.payment_method
                ? payment.payment_method.payment_method_id
                : null
        })
        .then(data => {
            payment_bucket_data.status = "done";
            console.log("SUCCESSFULLY SUBSCRIPTION STARTED", data, " on payment: ", payment);
        })
        .catch(error => {
            payment_bucket_data.status = "error";
            console.log("ERROR WHILE STARTING SUBSCRIPTION", error, " on payment: ", payment);
        });
    await Bucket.data
        .update(`${PAYMENT_BUCKET_ID}`, payment_bucket_data._id, payment_bucket_data)
        .then(_ => {
            console.log("Database updated for starting subscription", _);
        });
}

export async function customer(action) {
    console.log(process.env);
    __construct();
    Bucket.initialize({ apikey: `${SECRET_API_KEY}` });
    const customer = action.current;
    console.log("Creating a customer", customer.email);
    await stripe.customers
        .create({ email: customer.email })
        .then(data => {
            customer.stripe_customer_id = data.id;
            customer.status = "done";
            console.log("Customer created.", data);
        })
        .catch(error => {
            customer.status = "error";
            console.log(traceID, "Stripe create customer error.", error);
        });
    await Bucket.data
        .update(`${CUSTOMER_BUCKET_ID}`, customer._id, customer)
        .then(_ => {
            console.log("Customer updated", _, customer);
        })
        .catch(error => {
            console.log(traceID, "Error while updating Customer", error);
        });
}

export async function paymentMethod(action) {
    //get data
    __construct();
    Bucket.initialize({ apikey: `${SECRET_API_KEY}` });
    const payment = action.current;

    const payment_method_array = await Bucket.data.getAll(`${PAYMENT_METHOD_ID}`, {
        queryParams: {
            filter: {
                _id: payment._id
            },
            relation: true
        }
    });
    const payment_method = payment_method_array[0];

    //start action
    console.log("Creating a payment method.", payment_method);
    await stripe.paymentMethods
        .attach(payment_method.payment_method_id, {
            customer: payment_method.customer.stripe_customer_id
        })
        .then(async data => {
            console.log("Payment method created.", data);
            payment.status = "done";

            if (payment_method.default == true) {
                await stripe.customers.update(payment_method.customer.stripe_customer_id, {
                    invoice_settings: { default_payment_method: payment_method.payment_method_id }
                });
            }
        })
        .catch(error => {
            console.log(traceID, "Stripe add payment method error: ", error);
            payment.status = "error";
        });

    //update payment method bucket
    await Bucket.data
        .update(`${PAYMENT_METHOD_ID}`, payment._id, payment)
        .then(_ => {
            console.log("Payment Method updated");
        })
        .catch(error => {
            console.log(traceID, "Error while updating Payment Method", error);
        });
}

export async function product(action) {
    Bucket.initialize({ apikey: `${SECRET_API_KEY}` });
    const product = action.current;
    await stripe.products
        .create({ name: product.name })
        .then(data => {
            console.log("Successfully new product added.", data);
            product.status = "done";
            product.product_id = data.id;
        })
        .catch(error => {
            console.log("Error while adding new product.", error);
            product.status = "error";
        });

    await Bucket.data
        .update(`${PRODUCT_BUCKET_ID}`, product._id, product)
        .then(data => {
            console.log("Adding new product, database updated", data);
        })
        .catch(error => {
            console.log("Error while database updating", error);
        });
}

export async function plan(action) {
    Bucket.initialize({ apikey: `${SECRET_API_KEY}` });
    const plan_data = action.current;

    const plan_array = await Bucket.data.getAll(`${PLAN_BUCKET_ID}`, {
        queryParams: {
            filter: {
                _id: plan_data._id
            },
            relation: true
        }
    });
    const plan = plan_array[0];

    const amount = plan.amount * 100;

    await stripe.plans
        .create({
            amount: amount,
            currency: plan.currency,
            interval: plan.interval,
            product: plan.product.product_id
        })
        .then(data => {
            console.log("Successfully added new plan.", data);
            plan_data.status = "done";
            plan_data.price_id = data.id;
        })
        .catch(error => {
            console.log("Error while creating new plan.", error);
            plan_data.status = "error";
        });

    await Bucket.data
        .update(`${PLAN_BUCKET_ID}`, plan_data._id, plan_data)
        .then(data => {
            console.log("Adding new plan, database updated.", data);
        })
        .catch(error => {
            console.log("Error while updating database in adding new plan");
        });
}

export async function paymentMethodDefaultUpdate(action) {
    const payment = action.current;

    if (payment.default == true) {
        await stripe.customers.update(payment.customer, {
            invoice_settings: { default_payment_method: payment.payment_method_id }
        });
    }
}
