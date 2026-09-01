const Machine = require('../models/Machine');

const checkMachineLimit = async (req, res, next) => {
    try {
        const user = req.user;

        // Pro users have unlimited machines
        if (user.isProUser()) {
            return next();
        }

        // Free users are limited to 5 machines
        const machineCount = await Machine.countDocuments({ user: user._id });

        if (machineCount >= 5) {
            return res.status(403).json({
                success: false,
                message: 'Free tier limited to 5 machines. Upgrade to Pro for unlimited machines.',
                limit: 5,
                current: machineCount,
                upgrade: true,
            });
        }

        next();
    } catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

module.exports = { checkMachineLimit };
