import { Body, Controller, Post } from '@nestjs/common'
import { IsString, MinLength } from 'class-validator'
import { AuthService } from './auth.service'

class LoginDto {
	@IsString()
	@MinLength(1)
	user_name!: string

	@IsString()
	@MinLength(1)
	password!: string
}

@Controller('auth')
export class AuthController {
	constructor(private readonly auth: AuthService) {}

	@Post('login')
	login(@Body() body: LoginDto) {
		return this.auth.login(body.user_name, body.password)
	}
}
