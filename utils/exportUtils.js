// utils/exportUtils.js
const ExcelJS = require('exceljs');
const puppeteer = require('puppeteer');
const handlebars = require('handlebars');
const fs = require('fs');
const path = require('path');

// Register Handlebars helpers
handlebars.registerHelper('formatCurrency', function (amount) {
    if (amount === null || amount === undefined) return '0';
    return parseFloat(amount).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
});

handlebars.registerHelper('formatDate', function (date) {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('fr-FR');
});

handlebars.registerHelper('capitalize', function (str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
});

handlebars.registerHelper('getStatusClass', function (status) {
    switch (status?.toLowerCase()) {
        case 'payé': return 'status-paye';
        case 'en cours': return 'status-en-cours';
        case 'non payé': return 'status-non-paye';
        case 'partiellement payé': return 'status-partiellement-paye';
        default: return 'status-en-cours';
    }
});

handlebars.registerHelper('getSalaryStatusClass', function (status) {
    switch (status?.toLowerCase()) {
        case 'paid': return 'status-paid';
        case 'pending': return 'status-pending';
        case 'partial': return 'status-partial';
        default: return 'status-pending';
    }
});

handlebars.registerHelper('calculateCostPerStudent', function (totalStudents, totalOutcome) {
    if (!totalStudents || totalStudents === 0) return '0';
    return (totalOutcome / totalStudents).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
});

handlebars.registerHelper('calculateRevenuePerStudent', function (totalStudents, totalRevenue) {
    if (!totalStudents || totalStudents === 0) return '0';
    return (totalRevenue / totalStudents).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
});

handlebars.registerHelper('subtract', function (a, b) {
    return a - b;
});

handlebars.registerHelper('gt', function (a, b) {
    return a > b;
});

/**
 * Load and compile Handlebars template
 */
function loadTemplate(templateName) {
    const templatePath = path.join(__dirname, '..', 'templates', `${templateName}.hbs`);
    const templateContent = fs.readFileSync(templatePath, 'utf8');
    return handlebars.compile(templateContent);
}

/**
 * Generate PDF from HTML template using Puppeteer
 */
async function generatePDFFromHTML(html, options = {}) {
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });

        const pdfOptions = {
            format: 'A4',
            printBackground: true,
            margin: {
                top: '20px',
                right: '20px',
                bottom: '20px',
                left: '20px'
            },
            ...options
        };

        const pdfBuffer = await page.pdf(pdfOptions);
        return pdfBuffer;
    } finally {
        await browser.close();
    }
}
async function generateIncomeExcel(data, filters) {
    const workbook = new ExcelJS.Workbook();

    // Summary Sheet
    const summarySheet = workbook.addWorksheet('Résumé');

    // Add title
    summarySheet.mergeCells('A1:F1');
    summarySheet.getCell('A1').value = 'Analyse des Revenus - Résumé';
    summarySheet.getCell('A1').font = { bold: true, size: 16 };
    summarySheet.getCell('A1').alignment = { horizontal: 'center' };

    // Add filter information
    let row = 3;
    summarySheet.getCell(`A${row}`).value = 'Filtres appliqués:';
    summarySheet.getCell(`A${row}`).font = { bold: true };
    row++;

    if (filters.academicYear) {
        summarySheet.getCell(`A${row}`).value = `Année académique: ${filters.academicYear}`;
        row++;
    }
    if (filters.startDate) {
        summarySheet.getCell(`A${row}`).value = `Date de début: ${new Date(filters.startDate).toLocaleDateString('fr-FR')}`;
        row++;
    }
    if (filters.endDate) {
        summarySheet.getCell(`A${row}`).value = `Date de fin: ${new Date(filters.endDate).toLocaleDateString('fr-FR')}`;
        row++;
    }

    row += 2;

    // Summary statistics
    summarySheet.getCell(`A${row}`).value = 'Statistiques globales:';
    summarySheet.getCell(`A${row}`).font = { bold: true };
    row++;

    const summary = data.summary;
    const summaryData = [
        ['Total étudiants', summary.total_etudiants],
        ['Total attendu', `${summary.total_attendu.toLocaleString('fr-FR')} TND`],
        ['Total collecté', `${summary.total_collecte.toLocaleString('fr-FR')} TND`],
        ['Total en attente', `${summary.total_en_attente.toLocaleString('fr-FR')} TND`],
        ['Taux de collecte', `${summary.taux_global}%`],
        ['Total remises', `${summary.total_remises.toLocaleString('fr-FR')} TND`]
    ];

    summaryData.forEach(([label, value]) => {
        summarySheet.getCell(`A${row}`).value = label;
        summarySheet.getCell(`B${row}`).value = value;
        summarySheet.getCell(`A${row}`).font = { bold: true };
        row++;
    });

    // Component Analysis Sheet
    const componentSheet = workbook.addWorksheet('Analyse par Composant');

    // Headers
    const componentHeaders = ['Composant', 'Attendu (TND)', 'Collecté (TND)', 'En Attente (TND)', 'Taux (%)'];
    componentSheet.addRow(componentHeaders);
    const headerRow = componentSheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };

    // Data
    Object.values(data.componentAnalysis).forEach(component => {
        componentSheet.addRow([
            component.name,
            component.attendu,
            component.collecte,
            component.en_attente,
            component.taux
        ]);
    });

    // Level Analysis Sheet
    const levelSheet = workbook.addWorksheet('Analyse par Niveau');

    const levelHeaders = ['Niveau', 'Catégorie', 'Nb Étudiants', 'Attendu (TND)', 'Collecté (TND)', 'En Attente (TND)', 'Taux (%)'];
    levelSheet.addRow(levelHeaders);
    const levelHeaderRow = levelSheet.getRow(1);
    levelHeaderRow.font = { bold: true };
    levelHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };

    data.levelAnalysis.forEach(level => {
        levelSheet.addRow([
            level.niveau,
            level.categorie,
            level.nbr_etudiants,
            level.attendu,
            level.collecte,
            level.en_attente,
            level.taux
        ]);
    });

    // Student Analysis Sheet
    const studentSheet = workbook.addWorksheet('Analyse par Étudiant');

    const studentHeaders = ['Nom', 'Email', 'Niveau', 'Catégorie', 'Total Payé (TND)', 'Frais Inscription (TND)', 'Frais Scolaires (TND)', 'Uniforme (TND)', 'Transport (TND)', 'Statut', 'Remise (TND)', '% Remise'];
    studentSheet.addRow(studentHeaders);
    const studentHeaderRow = studentSheet.getRow(1);
    studentHeaderRow.font = { bold: true };
    studentHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };

    data.studentAnalysis.forEach(student => {
        const inscriptionPaid = student.paymentBreakdown?.inscriptionFee?.paid || 0;
        const fraisScolairesPaid = student.paymentBreakdown?.fraisScolaires?.paid || 0;
        const uniformPaid = student.paymentBreakdown?.uniform?.paid || 0;
        const transportPaid = student.paymentBreakdown?.transport?.paid || 0;

        studentSheet.addRow([
            student.nom,
            student.email,
            student.niveau,
            student.categorie,
            student.totalPaid || 0,
            inscriptionPaid,
            fraisScolairesPaid,
            uniformPaid,
            transportPaid,
            student.statut,
            student.remise || 0,
            student.pourcentage_remise || 0
        ]);
    });

    // Auto-fit columns
    [summarySheet, componentSheet, levelSheet, studentSheet].forEach(sheet => {
        sheet.columns.forEach(column => {
            let maxLength = 0;
            column.eachCell({ includeEmpty: true }, cell => {
                const columnLength = cell.value ? cell.value.toString().length : 10;
                if (columnLength > maxLength) {
                    maxLength = columnLength;
                }
            });
            column.width = maxLength < 10 ? 10 : maxLength + 2;
        });
    });

    return workbook;
}

/**
 * Generate Excel file for outcome data
 */
async function generateOutcomeExcel(data, filters) {
    const workbook = new ExcelJS.Workbook();

    // Summary Sheet
    const summarySheet = workbook.addWorksheet('Résumé');

    // Add title
    summarySheet.mergeCells('A1:F1');
    summarySheet.getCell('A1').value = 'Analyse des Dépenses - Résumé';
    summarySheet.getCell('A1').font = { bold: true, size: 16 };
    summarySheet.getCell('A1').alignment = { horizontal: 'center' };

    // Add filter information
    let row = 3;
    summarySheet.getCell(`A${row}`).value = 'Filtres appliqués:';
    summarySheet.getCell(`A${row}`).font = { bold: true };
    row++;

    if (filters.academicYear) {
        summarySheet.getCell(`A${row}`).value = `Année académique: ${filters.academicYear}`;
        row++;
    }
    if (filters.startDate) {
        summarySheet.getCell(`A${row}`).value = `Date de début: ${new Date(filters.startDate).toLocaleDateString('fr-FR')}`;
        row++;
    }
    if (filters.endDate) {
        summarySheet.getCell(`A${row}`).value = `Date de fin: ${new Date(filters.endDate).toLocaleDateString('fr-FR')}`;
        row++;
    }

    row += 2;

    // Summary statistics
    summarySheet.getCell(`A${row}`).value = 'Statistiques globales:';
    summarySheet.getCell(`A${row}`).font = { bold: true };
    row++;

    const summary = data.summary;
    const summaryData = [
        ['Total charges', `${summary.total_charges.toLocaleString('fr-FR')} TND`],
        ['Total salaires', `${summary.total_salaries.toLocaleString('fr-FR')} TND`],
        ['Salaires en attente', `${summary.pending_salaries.toLocaleString('fr-FR')} TND`],
        ['Total dépenses', `${summary.total_outcome.toLocaleString('fr-FR')} TND`],
        ['Nombre de charges', summary.charges_count],
        ['Nombre de salaires', summary.salaries_count],
        ['Charge moyenne', `${summary.average_charge.toLocaleString('fr-FR')} TND`],
        ['Salaire moyen', `${summary.average_salary.toLocaleString('fr-FR')} TND`]
    ];

    summaryData.forEach(([label, value]) => {
        summarySheet.getCell(`A${row}`).value = label;
        summarySheet.getCell(`B${row}`).value = value;
        summarySheet.getCell(`A${row}`).font = { bold: true };
        row++;
    });

    // Charge Analysis Sheet
    const chargeSheet = workbook.addWorksheet('Analyse des Charges');

    const chargeHeaders = ['Catégorie', 'Montant Total (TND)', 'Nombre', 'Montant Moyen (TND)', 'Montant Max (TND)', 'Montant Min (TND)'];
    chargeSheet.addRow(chargeHeaders);
    const chargeHeaderRow = chargeSheet.getRow(1);
    chargeHeaderRow.font = { bold: true };
    chargeHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };

    data.chargeAnalysis.forEach(charge => {
        chargeSheet.addRow([
            charge.categorie,
            charge.total_amount,
            charge.count,
            charge.avg_amount,
            charge.max_amount,
            charge.min_amount
        ]);
    });

    // Salary Analysis Sheet
    const salarySheet = workbook.addWorksheet('Analyse des Salaires');

    const salaryHeaders = ['Rôle', 'Type de Paiement', 'Total Payé (TND)', 'Total En Attente (TND)', 'Total Attendu (TND)', 'Nb Employés', 'Salaire Moyen (TND)', 'Taux de Paiement (%)'];
    salarySheet.addRow(salaryHeaders);
    const salaryHeaderRow = salarySheet.getRow(1);
    salaryHeaderRow.font = { bold: true };
    salaryHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };

    data.salaryAnalysis.forEach(salary => {
        salarySheet.addRow([
            salary.role,
            salary.paymentType,
            salary.total_paid,
            salary.total_pending,
            salary.total_expected,
            salary.employee_count,
            salary.avg_salary,
            salary.payment_rate
        ]);
    });

    // Auto-fit columns
    [summarySheet, chargeSheet, salarySheet].forEach(sheet => {
        sheet.columns.forEach(column => {
            let maxLength = 0;
            column.eachCell({ includeEmpty: true }, cell => {
                const columnLength = cell.value ? cell.value.toString().length : 10;
                if (columnLength > maxLength) {
                    maxLength = columnLength;
                }
            });
            column.width = maxLength < 10 ? 10 : maxLength + 2;
        });
    });

    return workbook;
}

/**
 * Generate combined Excel file for both income and outcome data
 */
async function generateCombinedExcel(incomeData, outcomeData, filters) {
    const workbook = new ExcelJS.Workbook();

    // Combined Summary Sheet
    const summarySheet = workbook.addWorksheet('Résumé Global');

    // Add title
    summarySheet.mergeCells('A1:F1');
    summarySheet.getCell('A1').value = 'Analyse Financière Complète - Revenus et Dépenses';
    summarySheet.getCell('A1').font = { bold: true, size: 16 };
    summarySheet.getCell('A1').alignment = { horizontal: 'center' };

    // Add filter information
    let row = 3;
    summarySheet.getCell(`A${row}`).value = 'Filtres appliqués:';
    summarySheet.getCell(`A${row}`).font = { bold: true };
    row++;

    if (filters.academicYear) {
        summarySheet.getCell(`A${row}`).value = `Année académique: ${filters.academicYear}`;
        row++;
    }
    if (filters.startDate) {
        summarySheet.getCell(`A${row}`).value = `Date de début: ${new Date(filters.startDate).toLocaleDateString('fr-FR')}`;
        row++;
    }
    if (filters.endDate) {
        summarySheet.getCell(`A${row}`).value = `Date de fin: ${new Date(filters.endDate).toLocaleDateString('fr-FR')}`;
        row++;
    }

    row += 2;

    // Financial Summary
    summarySheet.getCell(`A${row}`).value = 'Résumé Financier:';
    summarySheet.getCell(`A${row}`).font = { bold: true, size: 14 };
    row++;

    const incomeSummary = incomeData.summary;
    const outcomeSummary = outcomeData.summary;
    const netResult = incomeSummary.total_collecte - outcomeSummary.total_outcome;

    const financialData = [
        ['REVENUS', ''],
        ['Total collecté', `${incomeSummary.total_collecte.toLocaleString('fr-FR')} TND`],
        ['Total en attente', `${incomeSummary.total_en_attente.toLocaleString('fr-FR')} TND`],
        ['', ''],
        ['DÉPENSES', ''],
        ['Total charges', `${outcomeSummary.total_charges.toLocaleString('fr-FR')} TND`],
        ['Total salaires', `${outcomeSummary.total_salaries.toLocaleString('fr-FR')} TND`],
        ['Total dépenses', `${outcomeSummary.total_outcome.toLocaleString('fr-FR')} TND`],
        ['', ''],
        ['RÉSULTAT NET', `${netResult.toLocaleString('fr-FR')} TND`],
        ['Marge bénéficiaire', `${((netResult / incomeSummary.total_collecte) * 100).toFixed(2)}%`]
    ];

    financialData.forEach(([label, value]) => {
        if (label === 'REVENUS' || label === 'DÉPENSES') {
            summarySheet.getCell(`A${row}`).value = label;
            summarySheet.getCell(`A${row}`).font = { bold: true, color: { argb: 'FF0000FF' } };
        } else if (label === 'RÉSULTAT NET') {
            summarySheet.getCell(`A${row}`).value = label;
            summarySheet.getCell(`B${row}`).value = value;
            summarySheet.getCell(`A${row}`).font = { bold: true, color: { argb: netResult >= 0 ? 'FF008000' : 'FFFF0000' } };
            summarySheet.getCell(`B${row}`).font = { bold: true, color: { argb: netResult >= 0 ? 'FF008000' : 'FFFF0000' } };
        } else if (label !== '') {
            summarySheet.getCell(`A${row}`).value = label;
            summarySheet.getCell(`B${row}`).value = value;
            summarySheet.getCell(`A${row}`).font = { bold: true };
        }
        row++;
    });

    // Auto-fit columns
    summarySheet.columns.forEach(column => {
        let maxLength = 0;
        column.eachCell({ includeEmpty: true }, cell => {
            const columnLength = cell.value ? cell.value.toString().length : 0;
            if (columnLength > maxLength) {
                maxLength = columnLength;
            }
        });
        column.width = maxLength < 10 ? 10 : maxLength + 2;
    });

    return workbook;
}

/**
 * Generate PDF for income data using HTML template
 */
async function generateIncomePDF(data, filters) {
    try {
        const template = loadTemplate('income-report');

        // Prepare data for template
        const templateData = {
            currentDate: new Date().toLocaleDateString('fr-FR'),
            filters: filters,
            summary: data.summary,
            componentAnalysis: Object.values(data.componentAnalysis),
            levelAnalysis: data.levelAnalysis,
            studentAnalysis: data.studentAnalysis,
            categoryBreakdown: data.categoryBreakdown
        };

        const html = template(templateData);
        return await generatePDFFromHTML(html);
    } catch (error) {
        console.error('Error generating income PDF:', error);
        throw error;
    }
}

/**
 * Generate PDF for outcome data using HTML template
 */
async function generateOutcomePDF(data, filters) {
    try {

        const template = loadTemplate('outcome-report');

        // Calculate additional data for salaries if needed
        const processedSalaries = data.salaries ? data.salaries.map(salary => {
            // Convert Mongoose document to plain object if needed
            const salaryObj = salary.toObject ? salary.toObject() : salary;

            const totalAmount = salaryObj.paymentSchedule?.reduce((sum, payment) => sum + payment.totalAmount, 0) || 0;
            const paidAmount = salaryObj.paymentSchedule?.reduce((sum, payment) =>
                sum + (payment.paymentStatus === 'paid' || payment.paymentStatus === 'partial' ? payment.paidAmount || 0 : 0), 0) || 0;
            const remainingAmount = totalAmount - paidAmount;

            const paidCount = salaryObj.paymentSchedule?.filter(p => p.paymentStatus === 'paid').length || 0;
            const totalCount = salaryObj.paymentSchedule?.length || 1;
            const overallStatus = paidCount === totalCount ? 'paid' : paidCount > 0 ? 'partial' : 'pending';

            return {
                ...salaryObj,
                totalAmount,
                paidAmount,
                remainingAmount,
                overallStatus
            };
        }) : [];

        // Prepare data for template
        const templateData = {
            currentDate: new Date().toLocaleDateString('fr-FR'),
            filters: filters,
            summary: data.summary,
            chargeAnalysis: data.chargeAnalysis,
            salaryAnalysis: data.salaryAnalysis,
            charges: data.charges ? data.charges.slice(0, 10) : [], // Limit to top 10 for cleaner report
            salaries: processedSalaries
        };

        const html = template(templateData);
        return await generatePDFFromHTML(html);
    } catch (error) {
        console.error('Error generating outcome PDF:', error);
        throw error;
    }
}

/**
 * Generate combined PDF for both income and outcome data using HTML template
 */
async function generateCombinedPDF(incomeData, outcomeData, filters) {
    try {
        const template = loadTemplate('combined-report');

        // Calculate net result
        const netAmount = incomeData.summary.total_collecte - outcomeData.summary.total_outcome;
        const margin = incomeData.summary.total_collecte > 0 ?
            ((netAmount / incomeData.summary.total_collecte) * 100).toFixed(2) : 0;

        const netResult = {
            amount: netAmount,
            margin: margin,
            isPositive: netAmount >= 0
        };

        // Process salary data for combined report
        const processedSalaries = outcomeData.salaries ? outcomeData.salaries.map(salary => {
            // Convert Mongoose document to plain object if needed
            const salaryObj = salary.toObject ? salary.toObject() : salary;

            const totalAmount = salaryObj.paymentSchedule?.reduce((sum, payment) => sum + payment.totalAmount, 0) || 0;
            const paidAmount = salaryObj.paymentSchedule?.reduce((sum, payment) =>
                sum + (payment.paymentStatus === 'paid' || payment.paymentStatus === 'partial' ? payment.paidAmount || 0 : 0), 0) || 0;
            const remainingAmount = totalAmount - paidAmount;

            return {
                ...salaryObj,
                totalAmount,
                paidAmount,
                remainingAmount
            };
        }) : [];

        // Prepare data for template
        const templateData = {
            currentDate: new Date().toLocaleDateString('fr-FR'),
            filters: filters,
            incomeData: {
                ...incomeData,
                componentAnalysis: Object.values(incomeData.componentAnalysis)
            },
            outcomeData: {
                ...outcomeData,
                salaries: processedSalaries
            },
            netResult
        };

        const html = template(templateData);
        return await generatePDFFromHTML(html);
    } catch (error) {
        console.error('Error generating combined PDF:', error);
        throw error;
    }
}

module.exports = {
    generateIncomeExcel,
    generateOutcomeExcel,
    generateCombinedExcel,
    generateIncomePDF,
    generateOutcomePDF,
    generateCombinedPDF
};