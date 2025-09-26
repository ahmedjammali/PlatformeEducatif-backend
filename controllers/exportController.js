// controllers/exportController.js
const { getIncomeAnalytics } = require('./incomeAnalyticsController');
const { getOutcomeAnalytics } = require('./outcomeAnalyticsController');
const { generateIncomeExcel, generateOutcomeExcel, generateCombinedExcel, generateIncomePDF, generateOutcomePDF, generateCombinedPDF } = require('../utils/exportUtils');

/**
 * Helper function to get outcome analytics data
 */
async function getOutcomeAnalyticsData(filters) {
    return new Promise((resolve, reject) => {
        // Create a mock request and response object
        const mockReq = {
            query: filters,
            schoolId: filters.schoolId
        };

        const mockRes = {
            status: (code) => ({
                json: (data) => {
                    if (code === 200 && data.success) {
                        resolve(data.data);
                    } else {
                        reject(new Error(data.message || `Request failed with status ${code}`));
                    }
                }
            }),
            json: (data) => {
                // This should not be called directly, but handle it just in case
                if (data.success) {
                    resolve(data.data);
                } else {
                    reject(new Error(data.message || 'Failed to get outcome data'));
                }
            }
        };

        // Call the existing getOutcomeAnalytics function
        getOutcomeAnalytics(mockReq, mockRes).catch(reject);
    });
}


/**
 * Helper function to get income analytics data
 */
async function getIncomeAnalyticsData(filters) {
    return new Promise((resolve, reject) => {
        // Create a mock request and response object
        const mockReq = {
            query: filters,
            schoolId: filters.schoolId
        };

        const mockRes = {
            status: (code) => ({
                json: (data) => {
                    if (code === 200 && data.success) {
                        resolve(data.data);
                    } else {
                        reject(new Error(data.message || `Request failed with status ${code}`));
                    }
                }
            }),
            json: (data) => {
                // This should not be called directly, but handle it just in case
                if (data.success) {
                    resolve(data.data);
                } else {
                    reject(new Error(data.message || 'Failed to get income data'));
                }
            }
        };

        // Call the existing getIncomeAnalytics function
        getIncomeAnalytics(mockReq, mockRes).catch(reject);
    });
}

/**
 * Export income analytics to Excel
 */
exports.exportIncomeExcel = async (req, res) => {
    try {
        const filters = req.query;
        filters.schoolId = req.schoolId;

        // Get income data using existing function
        const data = await getIncomeAnalyticsData(filters);

        // Generate Excel file
        const workbook = await generateIncomeExcel(data, filters);
        const buffer = await workbook.xlsx.writeBuffer();

        // Set response headers for file download
        const filename = `analyse_revenus_${new Date().toISOString().split('T')[0]}.xlsx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', buffer.length);

        res.send(buffer);
    } catch (error) {
        console.error('Erreur lors de l\'export Excel des revenus:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de l\'export Excel des revenus',
            error: error.message
        });
    }
};

/**
 * Export income analytics to PDF
 */
exports.exportIncomePDF = async (req, res) => {
    try {
        const filters = req.query;
        filters.schoolId = req.schoolId;

        // Get income data using existing function
        const data = await getIncomeAnalyticsData(filters);

        // Generate PDF
        const pdfBuffer = await generateIncomePDF(data, filters);

        // Set response headers for file download
        const filename = `analyse_revenus_${new Date().toISOString().split('T')[0]}.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', pdfBuffer.length);

        res.send(pdfBuffer);
    } catch (error) {
        console.error('Erreur lors de l\'export PDF des revenus:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de l\'export PDF des revenus',
            error: error.message
        });
    }
};

/**
 * Export outcome analytics to Excel
 */
exports.exportOutcomeExcel = async (req, res) => {
    try {
        const filters = req.query;
        filters.schoolId = req.schoolId;

        // Get outcome data using existing function
        const data = await getOutcomeAnalyticsData(filters);

        // Generate Excel file
        const workbook = await generateOutcomeExcel(data, filters);
        const buffer = await workbook.xlsx.writeBuffer();

        // Set response headers for file download
        const filename = `analyse_depenses_${new Date().toISOString().split('T')[0]}.xlsx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', buffer.length);

        res.send(buffer);
    } catch (error) {
        console.error('Erreur lors de l\'export Excel des dépenses:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de l\'export Excel des dépenses',
            error: error.message
        });
    }
};

/**
 * Export outcome analytics to PDF
 */
exports.exportOutcomePDF = async (req, res) => {
    try {
        const filters = req.query;
        filters.schoolId = req.schoolId;

        // Get outcome data using existing function
        const data = await getOutcomeAnalyticsData(filters);

        // Generate PDF
        const pdfBuffer = await generateOutcomePDF(data, filters);

        // Set response headers for file download
        const filename = `analyse_depenses_${new Date().toISOString().split('T')[0]}.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', pdfBuffer.length);

        res.send(pdfBuffer);
    } catch (error) {
        console.error('Erreur lors de l\'export PDF des dépenses:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de l\'export PDF des dépenses',
            error: error.message
        });
    }
};

/**
 * Export combined income and outcome analytics to Excel
 */
exports.exportCombinedExcel = async (req, res) => {
    try {
        const filters = req.query;
        filters.schoolId = req.schoolId;

        console.log('Exporting combined Excel with filters:', filters);

        // Get both income and outcome data
        const [incomeData, outcomeData] = await Promise.all([
            getIncomeAnalyticsData(filters),
            getOutcomeAnalyticsData(filters)
        ]);

        // Generate combined Excel file
        const workbook = await generateCombinedExcel(incomeData, outcomeData, filters);
        const buffer = await workbook.xlsx.writeBuffer();

        // Set response headers for file download
        const filename = `analyse_financiere_complete_${new Date().toISOString().split('T')[0]}.xlsx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', buffer.length);

        res.send(buffer);
    } catch (error) {
        console.error('Erreur lors de l\'export Excel combiné:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de l\'export Excel combiné',
            error: error.message
        });
    }
};

/**
 * Export combined income and outcome analytics to PDF
 */
exports.exportCombinedPDF = async (req, res) => {
    try {
        const filters = req.query;
        filters.schoolId = req.schoolId;

        // Get both income and outcome data
        const [incomeData, outcomeData] = await Promise.all([
            getIncomeAnalyticsData(filters),
            getOutcomeAnalyticsData(filters)
        ]);

        // Generate combined PDF
        const pdfBuffer = await generateCombinedPDF(incomeData, outcomeData, filters);

        // Set response headers for file download
        const filename = `analyse_financiere_complete_${new Date().toISOString().split('T')[0]}.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', pdfBuffer.length);

        res.send(pdfBuffer);
    } catch (error) {
        console.error('Erreur lors de l\'export PDF combiné:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de l\'export PDF combiné',
            error: error.message
        });
    }
};