"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SyncModule = void 0;
const common_1 = require("@nestjs/common");
const clients_controller_1 = require("../clients/clients.controller");
const summary_controller_1 = require("../summary/summary.controller");
const provider_module_1 = require("../provider/provider.module");
const settings_module_1 = require("../settings/settings.module");
const sync_controller_1 = require("./sync.controller");
const sync_service_1 = require("./sync.service");
let SyncModule = class SyncModule {
};
exports.SyncModule = SyncModule;
exports.SyncModule = SyncModule = __decorate([
    (0, common_1.Module)({
        imports: [provider_module_1.ProviderModule, settings_module_1.SettingsModule],
        controllers: [sync_controller_1.SyncController, clients_controller_1.ClientsController, summary_controller_1.SummaryController],
        providers: [sync_service_1.SyncService],
        exports: [sync_service_1.SyncService],
    })
], SyncModule);
