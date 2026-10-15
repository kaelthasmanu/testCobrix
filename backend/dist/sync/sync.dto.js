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
exports.RunItemQueryDto = exports.RunQueryDto = exports.SyncQueryDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const pagination_1 = require("../common/pagination");
class SyncQueryDto {
    simulation;
}
exports.SyncQueryDto = SyncQueryDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ['true', 'false'], description: 'Si es true, calcula todo sin escribir nada.' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBooleanString)(),
    __metadata("design:type", String)
], SyncQueryDto.prototype, "simulation", void 0);
class RunQueryDto extends pagination_1.PageQueryDto {
    type;
}
exports.RunQueryDto = RunQueryDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ['import', 'payments'] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['import', 'payments']),
    __metadata("design:type", String)
], RunQueryDto.prototype, "type", void 0);
class RunItemQueryDto extends pagination_1.PageQueryDto {
    result;
    search;
}
exports.RunItemQueryDto = RunItemQueryDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Resultado, por ejemplo partial_payment.' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(40),
    __metadata("design:type", String)
], RunItemQueryDto.prototype, "result", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Cliente, documento, cuota o contrato.' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(80),
    __metadata("design:type", String)
], RunItemQueryDto.prototype, "search", void 0);
