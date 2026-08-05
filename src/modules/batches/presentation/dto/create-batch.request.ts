import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { CreateOrderRequestDto } from '../../../orders/presentation/dto/create-order.request';

export class CreateBatchRequestDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderRequestDto)
  orders!: CreateOrderRequestDto[];
}
