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
exports.ProviderConnectionDto = exports.UpdateSettingsDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const rules_1 = require("../common/rules");
/** Todos los campos son opcionales: se guarda solo lo que llega. `null` significa «sin límite». */
class UpdateSettingsDto {
    companyName;
    companyRif;
    billingEmail;
    timeZone;
    importableStatuses;
    importWindow;
    recentInstallmentsLimit;
    graceDays;
    maxNewInvoices;
    maxNewAmount;
    excludedDocumentTypes;
    automaticRunEnabled;
    automaticRunTime;
}
exports.UpdateSettingsDto = UpdateSettingsDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'Cobrix' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(120),
    __metadata("design:type", String)
], UpdateSettingsDto.prototype, "companyName", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'J-00000000-0' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(/^$|^[VEJGP]-?\d{6,9}-?\d?$/i, { message: 'El RIF debe tener la forma J-12345678-9.' }),
    __metadata("design:type", String)
], UpdateSettingsDto.prototype, "companyRif", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'cobranza@cobrix.com' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateIf)((dto) => dto.billingEmail !== ''),
    (0, class_validator_1.IsEmail)({}, { message: 'El correo de cobranza no es válido.' }),
    __metadata("design:type", String)
], UpdateSettingsDto.prototype, "billingEmail", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'America/Caracas', description: 'Zona horaria IANA de la empresa.' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateBy)({ name: 'isTimeZone', validator: { validate: rules_1.isValidTimeZone, defaultMessage: () => 'La zona horaria no es válida (usa un nombre IANA, por ejemplo America/Caracas).' } }),
    __metadata("design:type", String)
], UpdateSettingsDto.prototype, "timeZone", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: rules_1.KNOWN_CONTRACT_STATUSES, isArray: true }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayUnique)(),
    (0, class_validator_1.IsIn)(rules_1.KNOWN_CONTRACT_STATUSES, { each: true }),
    __metadata("design:type", Array)
], UpdateSettingsDto.prototype, "importableStatuses", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ['none', '3', '6', '9', '12'] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['none', '3', '6', '9', '12']),
    __metadata("design:type", String)
], UpdateSettingsDto.prototype, "importWindow", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true, minimum: 1, maximum: 60 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(60),
    __metadata("design:type", Object)
], UpdateSettingsDto.prototype, "recentInstallmentsLimit", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ minimum: 0, maximum: 60 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(60),
    __metadata("design:type", Number)
], UpdateSettingsDto.prototype, "graceDays", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true, minimum: 1 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Object)
], UpdateSettingsDto.prototype, "maxNewInvoices", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true, minimum: 0 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)({ maxDecimalPlaces: 2 }),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Object)
], UpdateSettingsDto.prototype, "maxNewAmount", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: rules_1.DOCUMENT_TYPES, isArray: true }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayUnique)(),
    (0, class_validator_1.IsIn)(rules_1.DOCUMENT_TYPES, { each: true }),
    __metadata("design:type", Array)
], UpdateSettingsDto.prototype, "excludedDocumentTypes", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], UpdateSettingsDto.prototype, "automaticRunEnabled", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: '06:00' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.Matches)(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'La hora debe tener la forma HH:MM.' }),
    __metadata("design:type", String)
], UpdateSettingsDto.prototype, "automaticRunTime", void 0);
/** Datos del proveedor. La contraseña vacía conserva la guardada. */
class ProviderConnectionDto {
    baseUrl;
    username;
    password;
}
exports.ProviderConnectionDto = ProviderConnectionDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'http://127.0.0.1:4310/api/v1' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUrl)({ require_tld: false, require_protocol: true, protocols: ['http', 'https'] }, { message: 'La URL de la API debe empezar por http:// o https://.' }),
    __metadata("design:type", String)
], ProviderConnectionDto.prototype, "baseUrl", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'cobrix' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(120),
    __metadata("design:type", String)
], ProviderConnectionDto.prototype, "username", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'cobrix-sandbox', format: 'password' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], ProviderConnectionDto.prototype, "password", void 0);
