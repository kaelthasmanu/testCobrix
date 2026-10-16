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
exports.PageQueryDto = exports.MAX_PAGE_SIZE = exports.DEFAULT_PAGE_SIZE = void 0;
exports.pageWindow = pageWindow;
exports.toPage = toPage;
const swagger_1 = require("@nestjs/swagger");
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
exports.DEFAULT_PAGE_SIZE = 20;
exports.MAX_PAGE_SIZE = 100;
/** `?page=1&pageSize=20`. Las tablas del panel nunca piden más de 100 filas por vez. */
class PageQueryDto {
    page;
    pageSize;
}
exports.PageQueryDto = PageQueryDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ minimum: 1, default: 1 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], PageQueryDto.prototype, "page", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ minimum: 1, maximum: exports.MAX_PAGE_SIZE, default: exports.DEFAULT_PAGE_SIZE }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(exports.MAX_PAGE_SIZE),
    __metadata("design:type", Number)
], PageQueryDto.prototype, "pageSize", void 0);
function pageWindow(query) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? exports.DEFAULT_PAGE_SIZE;
    return { page, pageSize, skip: (page - 1) * pageSize };
}
function toPage(items, total, page, pageSize) {
    return { items, total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}
