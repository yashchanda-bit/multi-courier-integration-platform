import {
  IsEmail,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';

export class ServiceabilityQueryDto {
  @IsString()
  @Length(1, 50)
  courier_partner!: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4,10}(,\d{4,10}){0,99}$/)
  pincodes?: string;
}

export class ReattemptDeliveryRequestDto {
  @IsString()
  @Length(1, 100)
  name!: string;

  @IsString()
  @Length(1, 255)
  address!: string;

  @IsString()
  @Length(1, 100)
  city!: string;

  @IsString()
  @Length(1, 100)
  state!: string;

  @IsString()
  @Matches(/^\d{4,10}$/)
  postal_code!: string;

  @IsString()
  @Matches(/^\+?[1-9]\d{7,14}$/)
  phone!: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}
