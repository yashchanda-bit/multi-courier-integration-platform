import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { PAYMENT_MODES } from '../../domain/order';
import type { PaymentMode } from '../../domain/order';

export class AddressDto {
  @IsString()
  @Length(1, 100)
  name!: string;

  @IsString()
  @Matches(/^\+?[1-9]\d{7,14}$/)
  phone!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsString()
  @Length(1, 255)
  address_line_1!: string;

  @IsOptional()
  @IsString()
  @Length(1, 255)
  address_line_2?: string;

  @IsString()
  @Length(1, 100)
  city!: string;

  @IsString()
  @Length(1, 100)
  state!: string;

  @IsString()
  @Length(2, 100)
  country!: string;

  @IsString()
  @Matches(/^\d{4,10}$/)
  postal_code!: string;
}

export class PackageDto {
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  @Max(1000)
  weight_kg!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  length_cm!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  breadth_cm!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  height_cm!: number;

  @IsInt()
  @Min(1)
  @Max(1000)
  pieces!: number;
}

export class PaymentDto {
  @IsIn(PAYMENT_MODES)
  mode!: PaymentMode;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  collectable_amount!: number;
}

export class InvoiceDto {
  @IsString()
  @Length(1, 100)
  number!: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  value!: number;
}

export class OrderItemDto {
  @IsString()
  @Length(1, 150)
  name!: string;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  description?: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unit_value!: number;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  sku?: string;

  @IsOptional()
  @IsString()
  @Length(1, 20)
  hsn_code?: string;
}

export class CreateOrderRequestDto {
  @IsString()
  @Length(1, 100)
  order_id!: string;

  @IsString()
  @Matches(/^[a-z0-9][a-z0-9_-]{1,49}$/)
  courier_partner!: string;

  @ValidateNested()
  @Type(() => AddressDto)
  consignee!: AddressDto;

  @ValidateNested()
  @Type(() => AddressDto)
  shipper!: AddressDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => AddressDto)
  return_address?: AddressDto;

  @ValidateNested()
  @Type(() => PackageDto)
  package!: PackageDto;

  @ValidateNested()
  @Type(() => PaymentDto)
  payment!: PaymentDto;

  @ValidateNested()
  @Type(() => InvoiceDto)
  invoice!: InvoiceDto;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items!: OrderItemDto[];

  @IsOptional()
  @IsString()
  @Length(1, 50)
  service_level?: string;
}
