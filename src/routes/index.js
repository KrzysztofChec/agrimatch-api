const router = require('express').Router();

router.use('/auth', require('./auth'));
router.use('/machines/:machineId/availability-periods', require('./availability'));
router.use('/machines', require('./machines'));
router.use('/bookings', require('./bookings'));

module.exports = router;
