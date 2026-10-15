"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_SETTINGS = void 0;
const rules_1 = require("../common/rules");
exports.DEFAULT_SETTINGS = {
    companyName: '',
    companyRif: '',
    billingEmail: '',
    timeZone: rules_1.DEFAULT_TIME_ZONE,
    importableStatuses: ['ACTIVO', 'CORTADO'],
    importWindow: 'none',
    recentInstallmentsLimit: null,
    graceDays: 0,
    maxNewInvoices: null,
    maxNewAmount: null,
    excludedDocumentTypes: [],
    automaticRunEnabled: false,
    automaticRunTime: '06:00',
};
