"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SummaryController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const summary_service_1 = require("./summary.service");
let SummaryController = class SummaryController {
    summary;
    constructor(summary) {
        this.summary = summary;
    }
    async get() {
        return this.summary.get();
    }
};
exports.SummaryController = SummaryController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Totales, proveedor, corrida automática, últimas corridas, antigüedad de la deuda y alertas' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], SummaryController.prototype, "get", null);
exports.SummaryController = SummaryController = __decorate([
    (0, common_1.Controller)('summary'),
    (0, swagger_1.ApiTags)('Resumen'),
    __metadata("design:paramtypes", [summary_service_1.SummaryService])
], SummaryController);
