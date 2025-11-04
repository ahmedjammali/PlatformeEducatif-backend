// migrations/migrate-payment-history.js
const mongoose = require('mongoose');
require('dotenv').config();

const StudentPayment = require('./models/StudentPayment');

const migratePaymentRecordsToHistory = async () => {
  try {
    console.log('🚀 Starting migration to payment history structure...');

    const allPayments = await StudentPayment.find({});
    console.log(`📊 Found ${allPayments.length} payment records to migrate`);

    let migratedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const payment of allPayments) {
      try {
        let needsSave = false;

        // 1. Migrate Inscription Fee
        if (payment.inscriptionFee && payment.inscriptionFee.applicable && payment.paidAmounts.inscriptionFee > 0) {
          if (!payment.inscriptionFee.paymentHistory || payment.inscriptionFee.paymentHistory.length === 0) {
            const actualPaymentDate = payment.inscriptionFee.paymentDate || payment.inscriptionFee._doc?.paymentDate || new Date();

            payment.inscriptionFee.paymentHistory = [{
              amount: payment.paidAmounts.inscriptionFee,
              paymentDate: actualPaymentDate,
              paymentMethod: payment.inscriptionFee.paymentMethod || 'cash',
              receiptNumber: payment.inscriptionFee.receiptNumber,
              notes: payment.inscriptionFee.notes,
              recordedBy: payment.inscriptionFee.recordedBy || payment.createdBy,
              recordedAt: actualPaymentDate
            }];
            needsSave = true;
            console.log(`✅ Migrated inscription fee - Payment date: ${actualPaymentDate}`);
          }
        }

        // 2. Migrate Uniform
        if (payment.uniform && payment.uniform.purchased && payment.paidAmounts.uniform > 0) {
          if (!payment.uniform.paymentHistory || payment.uniform.paymentHistory.length === 0) {
            const actualPaymentDate = payment.uniform.paymentDate || payment.uniform._doc?.paymentDate || new Date();

            payment.uniform.paymentHistory = [{
              amount: payment.paidAmounts.uniform,
              paymentDate: actualPaymentDate,
              paymentMethod: payment.uniform.paymentMethod || 'cash',
              receiptNumber: payment.uniform.receiptNumber,
              notes: payment.uniform.notes,
              recordedBy: payment.uniform.recordedBy || payment.createdBy,
              recordedAt: actualPaymentDate
            }];
            needsSave = true;
            console.log(`✅ Migrated uniform - Payment date: ${actualPaymentDate}`);
          }
        }

        // 3. Migrate Tuition Monthly Payments
        if (payment.tuitionMonthlyPayments && payment.tuitionMonthlyPayments.length > 0) {
          payment.tuitionMonthlyPayments.forEach((monthly) => {
            if (monthly.paidAmount > 0) {
              if (!monthly.paymentHistory || monthly.paymentHistory.length === 0) {
                const actualPaymentDate = monthly.paymentDate || monthly._doc?.paymentDate || monthly.dueDate;

                monthly.paymentHistory = [{
                  amount: monthly.paidAmount,
                  paymentDate: actualPaymentDate,
                  paymentMethod: monthly.paymentMethod || 'cash',
                  receiptNumber: monthly.receiptNumber,
                  notes: monthly.notes,
                  recordedBy: monthly.recordedBy || payment.createdBy,
                  recordedAt: actualPaymentDate
                }];
                needsSave = true;
                console.log(`✅ Migrated tuition month ${monthly.monthName} - Payment date: ${actualPaymentDate}`);
              }
            }
          });
        }

        // 4. Migrate Transportation Monthly Payments
        if (payment.transportation && payment.transportation.using && payment.transportation.monthlyPayments) {
          payment.transportation.monthlyPayments.forEach((monthly) => {
            if (monthly.paidAmount > 0) {
              if (!monthly.paymentHistory || monthly.paymentHistory.length === 0) {
                const actualPaymentDate = monthly.paymentDate || monthly._doc?.paymentDate || monthly.dueDate;

                monthly.paymentHistory = [{
                  amount: monthly.paidAmount,
                  paymentDate: actualPaymentDate,
                  paymentMethod: monthly.paymentMethod || 'cash',
                  receiptNumber: monthly.receiptNumber,
                  notes: monthly.notes,
                  recordedBy: monthly.recordedBy || payment.createdBy,
                  recordedAt: actualPaymentDate
                }];
                needsSave = true;
                console.log(`✅ Migrated transport month ${monthly.monthName} - Payment date: ${actualPaymentDate}`);
              }
            }
          });
        }

        // 5. Migrate Annual Tuition Payment
        if (payment.annualTuitionPayment && payment.annualTuitionPayment.isPaid) {
          if (!payment.annualTuitionPayment.paymentHistory || payment.annualTuitionPayment.paymentHistory.length === 0) {
            const actualPaymentDate = payment.annualTuitionPayment.paymentDate || payment.annualTuitionPayment._doc?.paymentDate || new Date();
            const annualAmount = payment.paidAmounts.tuition;
            
            payment.annualTuitionPayment.paymentHistory = [{
              amount: annualAmount,
              paymentDate: actualPaymentDate,
              paymentMethod: payment.annualTuitionPayment.paymentMethod || 'cash',
              receiptNumber: payment.annualTuitionPayment.receiptNumber,
              notes: payment.annualTuitionPayment.notes,
              recordedBy: payment.annualTuitionPayment.recordedBy || payment.createdBy,
              recordedAt: actualPaymentDate
            }];
            needsSave = true;
            console.log(`✅ Migrated annual payment - Payment date: ${actualPaymentDate}`);
          }
        }

        if (needsSave) {
          await payment.save();
          migratedCount++;
          console.log(`✅ Successfully migrated payment record for student ${payment.student}`);
        } else {
          skippedCount++;
        }

      } catch (error) {
        errorCount++;
        console.error(`❌ Error migrating payment for student ${payment.student}:`, error.message);
      }
    }

    console.log('\n📊 Migration Summary:');
    console.log(`✅ Successfully migrated: ${migratedCount}`);
    console.log(`⏭️  Skipped (no payments or already migrated): ${skippedCount}`);
    console.log(`❌ Errors: ${errorCount}`);
    console.log(`📋 Total processed: ${allPayments.length}`);

    return {
      total: allPayments.length,
      migrated: migratedCount,
      skipped: skippedCount,
      errors: errorCount
    };

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
};

const runMigration = async () => {
  try {
    console.log('🔌 Connecting to database...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to database');

    const result = await migratePaymentRecordsToHistory();

    console.log('\n✅ Migration completed successfully!');
    console.log('Result:', result);

    await mongoose.connection.close();
    console.log('✅ Database connection closed');

    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
};

runMigration();
