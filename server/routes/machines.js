const express = require('express');
const router = express.Router();
const Machine = require('../models/Machine');
const { protect } = require('../middleware/auth');
const { checkMachineLimit } = require('../middleware/subscription');
const multer = require('multer');
const Papa = require('papaparse');

// Configure multer for CSV upload
const upload = multer({
    storage: multer.memoryStorage(),
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
            cb(null, true);
        } else {
            cb(new Error('Only CSV files are allowed'));
        }
    },
});

// @route   GET /api/machines
// @desc    Get all machines for logged-in user
// @access  Private
router.get('/', protect, async (req, res) => {
    try {
        const machines = await Machine.find({ user: req.user._id }).sort({ createdAt: -1 });

        res.json({
            success: true,
            count: machines.length,
            data: machines,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server error',
        });
    }
});

// @route   POST /api/machines
// @desc    Add a single machine
// @access  Private
router.post('/', protect, checkMachineLimit, async (req, res) => {
    try {
        const { name } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({
                success: false,
                message: 'Please provide a machine name',
            });
        }

        const trimmedName = name.trim();

        // Check for duplicate name (case-insensitive)
        const existingMachine = await Machine.findOne({
            user: req.user._id,
            name: { $regex: new RegExp(`^${trimmedName}$`, 'i') }
        });

        if (existingMachine) {
            return res.status(400).json({
                success: false,
                message: `Machine "${trimmedName}" already exists. Please use a different name.`,
            });
        }

        const machine = await Machine.create({
            name: trimmedName,
            user: req.user._id,
        });

        res.status(201).json({
            success: true,
            data: machine,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server error',
        });
    }
});

// @route   POST /api/machines/bulk
// @desc    Bulk upload machines from CSV
// @access  Private
router.post('/bulk', protect, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'Please upload a CSV file',
            });
        }

        const csvData = req.file.buffer.toString('utf8');

        // Parse CSV - be lenient with parsing
        const parsed = Papa.parse(csvData, {
            header: true,
            skipEmptyLines: true,
            delimiter: ',', // Default to comma
            dynamicTyping: false,
        });

        // Only error on actual parse errors, not warnings
        const actualErrors = parsed.errors.filter(err => err.type !== 'Delimiter');
        if (actualErrors.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Error parsing CSV file',
                errors: actualErrors,
            });
        }

        // Extract machine names (assuming column is 'name' or 'machine' or first column)
        let machineNames = parsed.data.map(row => {
            return row.name || row.machine || row.Machine || row.Name || Object.values(row)[0];
        }).filter(name => name && name.trim());

        // If no names found with CSV parsing, try simple line-by-line parsing
        if (machineNames.length === 0) {
            machineNames = csvData
                .split(/\r?\n/)
                .map(line => line.trim())
                .filter(line => line && !line.startsWith('#')); // Allow comments with #
        }

        if (machineNames.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No valid machine names found in CSV',
            });
        }

        // Check machine limit for free users
        const currentCount = await Machine.countDocuments({ user: req.user._id });
        const totalAfterImport = currentCount + machineNames.length;

        if (!req.user.isProUser() && totalAfterImport > 5) {
            return res.status(403).json({
                success: false,
                message: `Free tier limited to 5 machines. You have ${currentCount} machines. Importing ${machineNames.length} would exceed the limit.`,
                limit: 5,
                current: currentCount,
                attempting: machineNames.length,
                upgrade: true,
            });
        }

        // Check for duplicates - filter out names that already exist
        const existingMachines = await Machine.find({
            user: req.user._id
        }).select('name');

        const existingNamesSet = new Set(
            existingMachines.map(m => m.name.toLowerCase())
        );

        const uniqueMachineNames = [];
        const duplicates = [];
        const newNamesSet = new Set();

        for (const name of machineNames) {
            const lowerName = name.toLowerCase();
            // Check if exists in DB or already in this batch
            if (existingNamesSet.has(lowerName) || newNamesSet.has(lowerName)) {
                duplicates.push(name);
            } else {
                uniqueMachineNames.push(name);
                newNamesSet.add(lowerName);
            }
        }

        if (uniqueMachineNames.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'All machine names already exist. No new machines to import.',
                duplicates: duplicates,
            });
        }

        // Create machines (only unique ones)
        const machines = await Machine.insertMany(
            uniqueMachineNames.map(name => ({
                name: name.trim(),
                user: req.user._id,
            }))
        );

        const response = {
            success: true,
            count: machines.length,
            data: machines,
        };

        // Include info about duplicates if any were skipped
        if (duplicates.length > 0) {
            response.message = `Imported ${machines.length} machine(s). Skipped ${duplicates.length} duplicate(s).`;
            response.skipped = duplicates.length;
        }

        res.status(201).json(response);
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server error during bulk upload',
        });
    }
});

// @route   POST /api/machines/bulk-delete
// @desc    Delete multiple machines
// @access  Private
router.post('/bulk-delete', protect, async (req, res) => {
    try {
        const { machineIds } = req.body;

        if (!machineIds || !Array.isArray(machineIds) || machineIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Please provide machine IDs to delete',
            });
        }

        const result = await Machine.deleteMany({
            _id: { $in: machineIds },
            user: req.user._id,
        });

        res.json({
            success: true,
            message: `${result.deletedCount} machine(s) deleted successfully`,
            count: result.deletedCount,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server error',
        });
    }
});

// @route   POST /api/machines/bulk-toggle
// @desc    Bulk activate or deactivate machines
// @access  Private
router.post('/bulk-toggle', protect, async (req, res) => {
    try {
        const { machineIds, isActive } = req.body;

        if (!machineIds || !Array.isArray(machineIds) || machineIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Please provide machine IDs',
            });
        }

        if (typeof isActive !== 'boolean') {
            return res.status(400).json({
                success: false,
                message: 'Please specify active status (true/false)',
            });
        }

        const result = await Machine.updateMany(
            {
                _id: { $in: machineIds },
                user: req.user._id,
            },
            {
                $set: { isActive }
            }
        );

        res.json({
            success: true,
            message: `${result.modifiedCount} machine(s) ${isActive ? 'activated' : 'deactivated'} successfully`,
            count: result.modifiedCount,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server error',
        });
    }
});

// @route   DELETE /api/machines/clear-all
// @desc    Delete all machines for the user
// @access  Private
router.delete('/clear-all', protect, async (req, res) => {
    try {
        const result = await Machine.deleteMany({ user: req.user._id });

        res.json({
            success: true,
            message: `All ${result.deletedCount} machine(s) deleted successfully`,
            count: result.deletedCount,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server error',
        });
    }
});

// @route   PUT /api/machines/:id
// @desc    Update machine (toggle active status or rename)
// @access  Private
router.put('/:id', protect, async (req, res) => {
    try {
        const machine = await Machine.findOne({
            _id: req.params.id,
            user: req.user._id,
        });

        if (!machine) {
            return res.status(404).json({
                success: false,
                message: 'Machine not found',
            });
        }

        // Update fields
        if (req.body.hasOwnProperty('isActive')) {
            machine.isActive = req.body.isActive;
        }
        if (req.body.name) {
            machine.name = req.body.name;
        }

        await machine.save();

        res.json({
            success: true,
            data: machine,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server error',
        });
    }
});

// @route   DELETE /api/machines/:id
// @desc    Delete a machine
// @access  Private
router.delete('/:id', protect, async (req, res) => {
    try {
        const machine = await Machine.findOne({
            _id: req.params.id,
            user: req.user._id,
        });

        if (!machine) {
            return res.status(404).json({
                success: false,
                message: 'Machine not found',
            });
        }

        await machine.deleteOne();

        res.json({
            success: true,
            message: 'Machine deleted successfully',
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server error',
        });
    }
});

module.exports = router;
