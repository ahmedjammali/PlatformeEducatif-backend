// Income Analytics Controller for Educational Platform
// Provides comprehensive income analysis from student payments

const StudentPayment = require('../models/StudentPayment');



// Main income analytics endpoint
const getIncomeAnalytics = async (req, res) => {
    try {
        const {
            grade,
            component,
            category,
            startDate,
            endDate,
            academicYear
        } = req.query;
        const schoolId = req.schoolId;

        // Build filter object
        let filter = {};

        if (schoolId) filter.school = schoolId;
        if (grade) filter.grade = grade;
        if (category) filter.gradeCategory = category;
        if (academicYear) filter.academicYear = academicYear;

        // Get all student payments matching basic filters
        let studentPayments = await StudentPayment.find(filter)
            .populate('student', 'name email')
            .populate('school', 'name')
            .lean();

        // Apply date range filter if provided
        if (startDate || endDate) {
            studentPayments = studentPayments.filter(payment => {
                const paymentDates = [];

                // Collect all payment dates from different components
                if (payment.inscriptionFee.paymentDate) {
                    paymentDates.push(payment.inscriptionFee.paymentDate);
                }
                if (payment.uniform.paymentDate) {
                    paymentDates.push(payment.uniform.paymentDate);
                }
                if (payment.annualTuitionPayment.paymentDate) {
                    paymentDates.push(payment.annualTuitionPayment.paymentDate);
                }

                // Add tuition monthly payments
                payment.tuitionMonthlyPayments.forEach(monthlyPayment => {
                    if (monthlyPayment.paymentDate) {
                        paymentDates.push(monthlyPayment.paymentDate);
                    }
                });

                // Add transportation monthly payments
                payment.transportation.monthlyPayments.forEach(monthlyPayment => {
                    if (monthlyPayment.paymentDate) {
                        paymentDates.push(monthlyPayment.paymentDate);
                    }
                });

                // Check if any payment date falls within the range
                return paymentDates.some(date => {
                    const paymentDate = new Date(date);
                    if (startDate && paymentDate < new Date(startDate)) return false;
                    if (endDate && paymentDate > new Date(endDate)) return false;
                    return true;
                });
            });
        }

        // Filter by component if specified
        if (component) {
            studentPayments = studentPayments.filter(payment => {
                switch (component) {
                    case 'frais_scolaires':
                        return payment.totalAmounts.tuition > 0;
                    case 'frais_inscription':
                        return payment.totalAmounts.inscriptionFee > 0;
                    case 'uniforme':
                        return payment.totalAmounts.uniform > 0;
                    case 'transport':
                        return payment.totalAmounts.transportation > 0;
                    default:
                        return true;
                }
            });
        }

        // Filter out students with 0 collected amounts (considering date range if applied)
        studentPayments = studentPayments.filter(payment => {
            if (startDate || endDate) {
                // Calculate date-range paid amounts for filtering
                let dateRangePaidTotal = 0;

                // Check inscription fee payment
                if (payment.inscriptionFee.paymentDate) {
                    const paymentDate = new Date(payment.inscriptionFee.paymentDate);
                    if ((!startDate || paymentDate >= new Date(startDate)) &&
                        (!endDate || paymentDate <= new Date(endDate))) {
                        dateRangePaidTotal += payment.paidAmounts.inscriptionFee || 0;
                    }
                }

                // Check uniform payment
                if (payment.uniform.paymentDate) {
                    const paymentDate = new Date(payment.uniform.paymentDate);
                    if ((!startDate || paymentDate >= new Date(startDate)) &&
                        (!endDate || paymentDate <= new Date(endDate))) {
                        dateRangePaidTotal += payment.paidAmounts.uniform || 0;
                    }
                }

                // Check annual tuition payment
                if (payment.annualTuitionPayment.paymentDate) {
                    const paymentDate = new Date(payment.annualTuitionPayment.paymentDate);
                    if ((!startDate || paymentDate >= new Date(startDate)) &&
                        (!endDate || paymentDate <= new Date(endDate))) {
                        dateRangePaidTotal += payment.annualTuitionPayment.amount || 0;
                    }
                }

                // Check monthly tuition payments
                payment.tuitionMonthlyPayments.forEach(monthlyPayment => {
                    if (monthlyPayment.paymentDate) {
                        const paymentDate = new Date(monthlyPayment.paymentDate);
                        if ((!startDate || paymentDate >= new Date(startDate)) &&
                            (!endDate || paymentDate <= new Date(endDate))) {
                            dateRangePaidTotal += monthlyPayment.amount || 0;
                        }
                    }
                });

                // Check monthly transportation payments
                payment.transportation.monthlyPayments.forEach(monthlyPayment => {
                    if (monthlyPayment.paymentDate) {
                        const paymentDate = new Date(monthlyPayment.paymentDate);
                        if ((!startDate || paymentDate >= new Date(startDate)) &&
                            (!endDate || paymentDate <= new Date(endDate))) {
                            dateRangePaidTotal += monthlyPayment.amount || 0;
                        }
                    }
                });

                return dateRangePaidTotal > 0;
            } else {
                return payment.paidAmounts.grandTotal > 0;
            }
        });

        // 1. Component Analysis (Analyse par Composant)
        const componentAnalysis = {
            frais_scolaires: {
                name: 'Frais Scolaires',
                attendu: 0,
                collecte: 0,
                en_attente: 0,
                taux: 0
            },
            frais_inscription: {
                name: 'Frais d\'Inscription',
                attendu: 0,
                collecte: 0,
                en_attente: 0,
                taux: 0
            },
            uniforme: {
                name: 'Uniforme',
                attendu: 0,
                collecte: 0,
                en_attente: 0,
                taux: 0
            },
            transport: {
                name: 'Transport',
                attendu: 0,
                collecte: 0,
                en_attente: 0,
                taux: 0
            }
        };

        studentPayments.forEach(payment => {
            // Calculate date-range specific paid amounts for component analysis
            let dateRangePaidAmounts = {
                inscriptionFee: 0,
                tuition: 0,
                uniform: 0,
                transportation: 0
            };

            if (startDate || endDate) {
                // Check inscription fee payment
                if (payment.inscriptionFee.paymentDate) {
                    const paymentDate = new Date(payment.inscriptionFee.paymentDate);
                    if ((!startDate || paymentDate >= new Date(startDate)) &&
                        (!endDate || paymentDate <= new Date(endDate))) {
                        dateRangePaidAmounts.inscriptionFee = payment.paidAmounts.inscriptionFee || 0;
                    }
                }

                // Check uniform payment
                if (payment.uniform.paymentDate) {
                    const paymentDate = new Date(payment.uniform.paymentDate);
                    if ((!startDate || paymentDate >= new Date(startDate)) &&
                        (!endDate || paymentDate <= new Date(endDate))) {
                        dateRangePaidAmounts.uniform = payment.paidAmounts.uniform || 0;
                    }
                }

                // Check annual tuition payment
                if (payment.annualTuitionPayment.paymentDate) {
                    const paymentDate = new Date(payment.annualTuitionPayment.paymentDate);
                    if ((!startDate || paymentDate >= new Date(startDate)) &&
                        (!endDate || paymentDate <= new Date(endDate))) {
                        dateRangePaidAmounts.tuition += payment.annualTuitionPayment.amount || 0;
                    }
                }

                // Check monthly tuition payments
                payment.tuitionMonthlyPayments.forEach(monthlyPayment => {
                    if (monthlyPayment.paymentDate) {
                        const paymentDate = new Date(monthlyPayment.paymentDate);
                        if ((!startDate || paymentDate >= new Date(startDate)) &&
                            (!endDate || paymentDate <= new Date(endDate))) {
                            dateRangePaidAmounts.tuition += monthlyPayment.amount || 0;
                        }
                    }
                });

                // Check monthly transportation payments
                payment.transportation.monthlyPayments.forEach(monthlyPayment => {
                    if (monthlyPayment.paymentDate) {
                        const paymentDate = new Date(monthlyPayment.paymentDate);
                        if ((!startDate || paymentDate >= new Date(startDate)) &&
                            (!endDate || paymentDate <= new Date(endDate))) {
                            dateRangePaidAmounts.transportation += monthlyPayment.amount || 0;
                        }
                    }
                });
            } else {
                // If no date filter, use all paid amounts
                dateRangePaidAmounts = {
                    inscriptionFee: payment.paidAmounts.inscriptionFee || 0,
                    tuition: payment.paidAmounts.tuition || 0,
                    uniform: payment.paidAmounts.uniform || 0,
                    transportation: payment.paidAmounts.transportation || 0
                };
            }

            // Frais scolaires
            componentAnalysis.frais_scolaires.attendu += payment.totalAmounts.tuition;
            componentAnalysis.frais_scolaires.collecte += dateRangePaidAmounts.tuition;
            componentAnalysis.frais_scolaires.en_attente += (payment.totalAmounts.tuition - dateRangePaidAmounts.tuition);

            // Frais inscription
            componentAnalysis.frais_inscription.attendu += payment.totalAmounts.inscriptionFee;
            componentAnalysis.frais_inscription.collecte += dateRangePaidAmounts.inscriptionFee;
            componentAnalysis.frais_inscription.en_attente += (payment.totalAmounts.inscriptionFee - dateRangePaidAmounts.inscriptionFee);

            // Uniforme
            componentAnalysis.uniforme.attendu += payment.totalAmounts.uniform;
            componentAnalysis.uniforme.collecte += dateRangePaidAmounts.uniform;
            componentAnalysis.uniforme.en_attente += (payment.totalAmounts.uniform - dateRangePaidAmounts.uniform);

            // Transport
            componentAnalysis.transport.attendu += payment.totalAmounts.transportation;
            componentAnalysis.transport.collecte += dateRangePaidAmounts.transportation;
            componentAnalysis.transport.en_attente += (payment.totalAmounts.transportation - dateRangePaidAmounts.transportation);
        });

        // Calculate rates for component analysis
        Object.keys(componentAnalysis).forEach(key => {
            const component = componentAnalysis[key];
            component.taux = component.attendu > 0 ?
                Math.round((component.collecte / component.attendu) * 100) : 0;
        });

        // 2. Level Analysis (Analyse par Niveau)
        const levelAnalysis = {};

        studentPayments.forEach(payment => {
            const level = payment.grade;

            if (!levelAnalysis[level]) {
                levelAnalysis[level] = {
                    niveau: level,
                    categorie: payment.gradeCategory,
                    nbr_etudiants: 0,
                    attendu: 0,
                    collecte: 0,
                    en_attente: 0,
                    taux: 0
                };
            }

            // Calculate date-range specific paid amounts for level analysis
            let dateRangePaidAmounts = {
                inscriptionFee: 0,
                tuition: 0,
                uniform: 0,
                transportation: 0
            };

            if (startDate || endDate) {
                // Check inscription fee payment
                if (payment.inscriptionFee.paymentDate) {
                    const paymentDate = new Date(payment.inscriptionFee.paymentDate);
                    if ((!startDate || paymentDate >= new Date(startDate)) &&
                        (!endDate || paymentDate <= new Date(endDate))) {
                        dateRangePaidAmounts.inscriptionFee = payment.paidAmounts.inscriptionFee || 0;
                    }
                }

                // Check uniform payment
                if (payment.uniform.paymentDate) {
                    const paymentDate = new Date(payment.uniform.paymentDate);
                    if ((!startDate || paymentDate >= new Date(startDate)) &&
                        (!endDate || paymentDate <= new Date(endDate))) {
                        dateRangePaidAmounts.uniform = payment.paidAmounts.uniform || 0;
                    }
                }

                // Check annual tuition payment
                if (payment.annualTuitionPayment.paymentDate) {
                    const paymentDate = new Date(payment.annualTuitionPayment.paymentDate);
                    if ((!startDate || paymentDate >= new Date(startDate)) &&
                        (!endDate || paymentDate <= new Date(endDate))) {
                        dateRangePaidAmounts.tuition += payment.annualTuitionPayment.amount || 0;
                    }
                }

                // Check monthly tuition payments
                payment.tuitionMonthlyPayments.forEach(monthlyPayment => {
                    if (monthlyPayment.paymentDate) {
                        const paymentDate = new Date(monthlyPayment.paymentDate);
                        if ((!startDate || paymentDate >= new Date(startDate)) &&
                            (!endDate || paymentDate <= new Date(endDate))) {
                            dateRangePaidAmounts.tuition += monthlyPayment.amount || 0;
                        }
                    }
                });

                // Check monthly transportation payments
                payment.transportation.monthlyPayments.forEach(monthlyPayment => {
                    if (monthlyPayment.paymentDate) {
                        const paymentDate = new Date(monthlyPayment.paymentDate);
                        if ((!startDate || paymentDate >= new Date(startDate)) &&
                            (!endDate || paymentDate <= new Date(endDate))) {
                            dateRangePaidAmounts.transportation += monthlyPayment.amount || 0;
                        }
                    }
                });
            } else {
                // If no date filter, use all paid amounts
                dateRangePaidAmounts = {
                    inscriptionFee: payment.paidAmounts.inscriptionFee || 0,
                    tuition: payment.paidAmounts.tuition || 0,
                    uniform: payment.paidAmounts.uniform || 0,
                    transportation: payment.paidAmounts.transportation || 0
                };
            }

            const dateRangeTotalPaid = dateRangePaidAmounts.inscriptionFee +
                                     dateRangePaidAmounts.tuition +
                                     dateRangePaidAmounts.uniform +
                                     dateRangePaidAmounts.transportation;

            levelAnalysis[level].nbr_etudiants += 1;
            levelAnalysis[level].attendu += payment.totalAmounts.grandTotal;
            levelAnalysis[level].collecte += dateRangeTotalPaid;
            levelAnalysis[level].en_attente += (payment.totalAmounts.grandTotal - dateRangeTotalPaid);
        });

        // Calculate rates for level analysis
        Object.keys(levelAnalysis).forEach(level => {
            const analysis = levelAnalysis[level];
            analysis.taux = analysis.attendu > 0 ?
                Math.round((analysis.collecte / analysis.attendu) * 100) : 0;
        });

        // Convert to array and sort by grade category and name
        const levelAnalysisArray = Object.values(levelAnalysis).sort((a, b) => {
            if (a.categorie !== b.categorie) {
                const categoryOrder = { maternelle: 1, primaire: 2, secondaire: 3 };
                return categoryOrder[a.categorie] - categoryOrder[b.categorie];
            }
            return a.niveau.localeCompare(b.niveau);
        });

        // 3. Student Analysis (Analyse par Étudiant)
        const studentAnalysis = studentPayments.map(payment => {
            // Calculate discount amount
            let discountAmount = 0;
            if (payment.discount && payment.discount.enabled) {
                if (payment.discount.type === 'annual') {
                    discountAmount = (payment.totalAmounts.tuition * payment.discount.percentage) / 100;
                } else if (payment.discount.type === 'monthly') {
                    discountAmount = (payment.tuitionFees.monthlyAmount * payment.discount.percentage) / 100 * 12;
                }
            }

            // Determine payment status
            let statut = 'En cours';
            if (payment.remainingAmounts.grandTotal === 0) {
                statut = 'Payé';
            } else if (payment.paidAmounts.grandTotal === 0) {
                statut = 'Non payé';
            } else if (payment.remainingAmounts.grandTotal > payment.totalAmounts.grandTotal * 0.5) {
                statut = 'Partiellement payé';
            }

            // Calculate payment breakdown for the specific date range (if date filters are applied)
            let dateRangePaidAmounts = {
                inscriptionFee: 0,
                tuition: 0,
                uniform: 0,
                transportation: 0
            };

            if (startDate || endDate) {
                // Check inscription fee payment
                if (payment.inscriptionFee.paymentDate) {
                    const paymentDate = new Date(payment.inscriptionFee.paymentDate);
                    if ((!startDate || paymentDate >= new Date(startDate)) &&
                        (!endDate || paymentDate <= new Date(endDate))) {
                        dateRangePaidAmounts.inscriptionFee = payment.paidAmounts.inscriptionFee || 0;
                    }
                }

                // Check uniform payment
                if (payment.uniform.paymentDate) {
                    const paymentDate = new Date(payment.uniform.paymentDate);
                    if ((!startDate || paymentDate >= new Date(startDate)) &&
                        (!endDate || paymentDate <= new Date(endDate))) {
                        dateRangePaidAmounts.uniform = payment.paidAmounts.uniform || 0;
                    }
                }

                // Check annual tuition payment
                if (payment.annualTuitionPayment.paymentDate) {
                    const paymentDate = new Date(payment.annualTuitionPayment.paymentDate);
                    if ((!startDate || paymentDate >= new Date(startDate)) &&
                        (!endDate || paymentDate <= new Date(endDate))) {
                        dateRangePaidAmounts.tuition += payment.annualTuitionPayment.amount || 0;
                    }
                }

                // Check monthly tuition payments
                payment.tuitionMonthlyPayments.forEach(monthlyPayment => {
                    if (monthlyPayment.paymentDate) {
                        const paymentDate = new Date(monthlyPayment.paymentDate);
                        if ((!startDate || paymentDate >= new Date(startDate)) &&
                            (!endDate || paymentDate <= new Date(endDate))) {
                            dateRangePaidAmounts.tuition += monthlyPayment.amount || 0;
                        }
                    }
                });

                // Check monthly transportation payments
                payment.transportation.monthlyPayments.forEach(monthlyPayment => {
                    if (monthlyPayment.paymentDate) {
                        const paymentDate = new Date(monthlyPayment.paymentDate);
                        if ((!startDate || paymentDate >= new Date(startDate)) &&
                            (!endDate || paymentDate <= new Date(endDate))) {
                            dateRangePaidAmounts.transportation += monthlyPayment.amount || 0;
                        }
                    }
                });
            } else {
                // If no date filter, use all paid amounts
                dateRangePaidAmounts = {
                    inscriptionFee: payment.paidAmounts.inscriptionFee || 0,
                    tuition: payment.paidAmounts.tuition || 0,
                    uniform: payment.paidAmounts.uniform || 0,
                    transportation: payment.paidAmounts.transportation || 0
                };
            }

            // Create detailed payment breakdown
            const paymentBreakdown = {
                inscriptionFee: {
                    applicable: payment.inscriptionFee && payment.inscriptionFee.applicable,
                    total: payment.totalAmounts.inscriptionFee || 0,
                    paid: dateRangePaidAmounts.inscriptionFee,
                    isPaid: payment.inscriptionFee && payment.inscriptionFee.isPaid
                },
                fraisScolaires: {
                    total: payment.totalAmounts.tuition || 0,
                    paid: dateRangePaidAmounts.tuition,
                    type: payment.paymentType,
                    monthlyAmount: payment.tuitionFees.monthlyAmount || 0
                },
                uniform: {
                    applicable: payment.uniform && payment.uniform.purchased,
                    total: payment.totalAmounts.uniform || 0,
                    paid: dateRangePaidAmounts.uniform,
                    isPaid: payment.uniform && payment.uniform.isPaid
                },
                transport: {
                    applicable: payment.transportation && payment.transportation.using,
                    total: payment.totalAmounts.transportation || 0,
                    paid: dateRangePaidAmounts.transportation,
                    type: payment.transportation && payment.transportation.type,
                    monthlyAmount: payment.transportation.monthlyPrice || 0
                }
            };

            // Calculate total paid for the date range
            const dateRangeTotalPaid = dateRangePaidAmounts.inscriptionFee +
                                     dateRangePaidAmounts.tuition +
                                     dateRangePaidAmounts.uniform +
                                     dateRangePaidAmounts.transportation;

            return {
                studentId: payment.student._id,
                nom: payment.student.name,
                email: payment.student.email,
                niveau: payment.grade,
                categorie: payment.gradeCategory,
                totalPaid: dateRangeTotalPaid,
                paymentBreakdown: paymentBreakdown,
                statut: statut,
                remise: discountAmount,
                pourcentage_remise: payment.discount && payment.discount.enabled ? payment.discount.percentage : 0,
                academicYear: payment.academicYear
            };
        });

        // Sort student analysis by name
        studentAnalysis.sort((a, b) => a.nom.localeCompare(b.nom));

        // 4. Summary Statistics
        let totalDateRangePaid = 0;

        // Calculate total paid within date range
        studentPayments.forEach(payment => {
            let dateRangePaidAmounts = {
                inscriptionFee: 0,
                tuition: 0,
                uniform: 0,
                transportation: 0
            };

            if (startDate || endDate) {
                // Check inscription fee payment
                if (payment.inscriptionFee.paymentDate) {
                    const paymentDate = new Date(payment.inscriptionFee.paymentDate);
                    if ((!startDate || paymentDate >= new Date(startDate)) &&
                        (!endDate || paymentDate <= new Date(endDate))) {
                        dateRangePaidAmounts.inscriptionFee = payment.paidAmounts.inscriptionFee || 0;
                    }
                }

                // Check uniform payment
                if (payment.uniform.paymentDate) {
                    const paymentDate = new Date(payment.uniform.paymentDate);
                    if ((!startDate || paymentDate >= new Date(startDate)) &&
                        (!endDate || paymentDate <= new Date(endDate))) {
                        dateRangePaidAmounts.uniform = payment.paidAmounts.uniform || 0;
                    }
                }

                // Check annual tuition payment
                if (payment.annualTuitionPayment.paymentDate) {
                    const paymentDate = new Date(payment.annualTuitionPayment.paymentDate);
                    if ((!startDate || paymentDate >= new Date(startDate)) &&
                        (!endDate || paymentDate <= new Date(endDate))) {
                        dateRangePaidAmounts.tuition += payment.annualTuitionPayment.amount || 0;
                    }
                }

                // Check monthly tuition payments
                payment.tuitionMonthlyPayments.forEach(monthlyPayment => {
                    if (monthlyPayment.paymentDate) {
                        const paymentDate = new Date(monthlyPayment.paymentDate);
                        if ((!startDate || paymentDate >= new Date(startDate)) &&
                            (!endDate || paymentDate <= new Date(endDate))) {
                            dateRangePaidAmounts.tuition += monthlyPayment.amount || 0;
                        }
                    }
                });

                // Check monthly transportation payments
                payment.transportation.monthlyPayments.forEach(monthlyPayment => {
                    if (monthlyPayment.paymentDate) {
                        const paymentDate = new Date(monthlyPayment.paymentDate);
                        if ((!startDate || paymentDate >= new Date(startDate)) &&
                            (!endDate || paymentDate <= new Date(endDate))) {
                            dateRangePaidAmounts.transportation += monthlyPayment.amount || 0;
                        }
                    }
                });
            } else {
                // If no date filter, use all paid amounts
                dateRangePaidAmounts = {
                    inscriptionFee: payment.paidAmounts.inscriptionFee || 0,
                    tuition: payment.paidAmounts.tuition || 0,
                    uniform: payment.paidAmounts.uniform || 0,
                    transportation: payment.paidAmounts.transportation || 0
                };
            }

            totalDateRangePaid += dateRangePaidAmounts.inscriptionFee +
                                dateRangePaidAmounts.tuition +
                                dateRangePaidAmounts.uniform +
                                dateRangePaidAmounts.transportation;
        });

        const totalAttendu = studentPayments.reduce((sum, payment) => sum + payment.totalAmounts.grandTotal, 0);

        const summary = {
            total_etudiants: studentPayments.length,
            total_attendu: totalAttendu,
            total_collecte: totalDateRangePaid,
            total_en_attente: totalAttendu - totalDateRangePaid,
            taux_global: 0,
            total_remises: studentAnalysis.reduce((sum, student) => sum + student.remise, 0)
        };

        summary.taux_global = summary.total_attendu > 0 ?
            Math.round((summary.total_collecte / summary.total_attendu) * 100) : 0;

        // 5. Category Breakdown
        const categoryBreakdown = {
            maternelle: { etudiants: 0, attendu: 0, collecte: 0, en_attente: 0, taux: 0 },
            primaire: { etudiants: 0, attendu: 0, collecte: 0, en_attente: 0, taux: 0 },
            secondaire: { etudiants: 0, attendu: 0, collecte: 0, en_attente: 0, taux: 0 }
        };

        studentPayments.forEach(payment => {
            const category = payment.gradeCategory;
            if (categoryBreakdown[category]) {
                // Calculate date-range specific paid amounts for category breakdown
                let dateRangePaidAmounts = {
                    inscriptionFee: 0,
                    tuition: 0,
                    uniform: 0,
                    transportation: 0
                };

                if (startDate || endDate) {
                    // Check inscription fee payment
                    if (payment.inscriptionFee.paymentDate) {
                        const paymentDate = new Date(payment.inscriptionFee.paymentDate);
                        if ((!startDate || paymentDate >= new Date(startDate)) &&
                            (!endDate || paymentDate <= new Date(endDate))) {
                            dateRangePaidAmounts.inscriptionFee = payment.paidAmounts.inscriptionFee || 0;
                        }
                    }

                    // Check uniform payment
                    if (payment.uniform.paymentDate) {
                        const paymentDate = new Date(payment.uniform.paymentDate);
                        if ((!startDate || paymentDate >= new Date(startDate)) &&
                            (!endDate || paymentDate <= new Date(endDate))) {
                            dateRangePaidAmounts.uniform = payment.paidAmounts.uniform || 0;
                        }
                    }

                    // Check annual tuition payment
                    if (payment.annualTuitionPayment.paymentDate) {
                        const paymentDate = new Date(payment.annualTuitionPayment.paymentDate);
                        if ((!startDate || paymentDate >= new Date(startDate)) &&
                            (!endDate || paymentDate <= new Date(endDate))) {
                            dateRangePaidAmounts.tuition += payment.annualTuitionPayment.amount || 0;
                        }
                    }

                    // Check monthly tuition payments
                    payment.tuitionMonthlyPayments.forEach(monthlyPayment => {
                        if (monthlyPayment.paymentDate) {
                            const paymentDate = new Date(monthlyPayment.paymentDate);
                            if ((!startDate || paymentDate >= new Date(startDate)) &&
                                (!endDate || paymentDate <= new Date(endDate))) {
                                dateRangePaidAmounts.tuition += monthlyPayment.amount || 0;
                            }
                        }
                    });

                    // Check monthly transportation payments
                    payment.transportation.monthlyPayments.forEach(monthlyPayment => {
                        if (monthlyPayment.paymentDate) {
                            const paymentDate = new Date(monthlyPayment.paymentDate);
                            if ((!startDate || paymentDate >= new Date(startDate)) &&
                                (!endDate || paymentDate <= new Date(endDate))) {
                                dateRangePaidAmounts.transportation += monthlyPayment.amount || 0;
                            }
                        }
                    });
                } else {
                    // If no date filter, use all paid amounts
                    dateRangePaidAmounts = {
                        inscriptionFee: payment.paidAmounts.inscriptionFee || 0,
                        tuition: payment.paidAmounts.tuition || 0,
                        uniform: payment.paidAmounts.uniform || 0,
                        transportation: payment.paidAmounts.transportation || 0
                    };
                }

                const dateRangeTotalPaid = dateRangePaidAmounts.inscriptionFee +
                                         dateRangePaidAmounts.tuition +
                                         dateRangePaidAmounts.uniform +
                                         dateRangePaidAmounts.transportation;

                categoryBreakdown[category].etudiants += 1;
                categoryBreakdown[category].attendu += payment.totalAmounts.grandTotal;
                categoryBreakdown[category].collecte += dateRangeTotalPaid;
                categoryBreakdown[category].en_attente += (payment.totalAmounts.grandTotal - dateRangeTotalPaid);
            }
        });

        // Calculate rates for category breakdown
        Object.keys(categoryBreakdown).forEach(category => {
            const cat = categoryBreakdown[category];
            cat.taux = cat.attendu > 0 ? Math.round((cat.collecte / cat.attendu) * 100) : 0;
        });

        // Response object
        const response = {
            success: true,
            message: 'Analyse des revenus récupérée avec succès',
            data: {
                summary,
                componentAnalysis,
                levelAnalysis: levelAnalysisArray,
                studentAnalysis,
                categoryBreakdown,
                filters: {
                    schoolId,
                    grade,
                    component,
                    category,
                    startDate,
                    endDate,
                    academicYear
                }
            }
        };

        res.status(200).json(response);
    } catch (error) {
        console.error('Erreur lors de la récupération de l\'analyse des revenus:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur interne du serveur',
            error: error.message
        });
    }
};

// Get available filter options
const getIncomeFilters = async (req, res) => {
    try {
        const schoolId = req.schoolId;
        let filter = {};
        if (schoolId) filter.school = schoolId;

        // Get unique grades
        const grades = await StudentPayment.distinct('grade', filter);

        // Get unique academic years
        const academicYears = await StudentPayment.distinct('academicYear', filter);

        // Get unique categories
        const categories = await StudentPayment.distinct('gradeCategory', filter);

        // Payment components
        const components = [
            { value: 'frais_scolaires', label: 'Frais Scolaires' },
            { value: 'frais_inscription', label: 'Frais d\'Inscription' },
            { value: 'uniforme', label: 'Uniforme' },
            { value: 'transport', label: 'Transport' }
        ];

        res.status(200).json({
            success: true,
            data: {
                grades: grades.sort(),
                categories: categories.sort(),
                components,
                academicYears: academicYears.sort().reverse()
            }
        });
    } catch (error) {
        console.error('Erreur lors de la récupération des filtres:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur interne du serveur',
            error: error.message
        });
    }
};



module.exports = {
    getIncomeAnalytics,
    getIncomeFilters,
};