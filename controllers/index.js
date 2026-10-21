module.exports = app => {
    require('./healthController')(app);
    require('./soccerController')(app);
    require('./adController')(app);
    require('./paymentController')(app);
    require('./accountController')(app);
    require('./adminController')(app);
    require('./bookingController')(app);
    require('./footballApiController')(app);
    require('./seoController')(app); // SEO catch-all routes should stay last
};
