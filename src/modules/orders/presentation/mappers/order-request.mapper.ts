import { NormalizedOrder } from '../../domain/order';
import { AddressDto, CreateOrderRequestDto } from '../dto/create-order.request';

const mapAddress = (address: AddressDto) => ({
  name: address.name,
  phone: address.phone,
  email: address.email,
  addressLine1: address.address_line_1,
  addressLine2: address.address_line_2,
  city: address.city,
  state: address.state,
  country: address.country,
  postalCode: address.postal_code,
});

export const mapCreateOrderRequest = (
  request: CreateOrderRequestDto,
): NormalizedOrder => ({
  orderId: request.order_id,
  courierPartner: request.courier_partner,
  consignee: mapAddress(request.consignee),
  shipper: mapAddress(request.shipper),
  returnAddress: request.return_address
    ? mapAddress(request.return_address)
    : undefined,
  package: {
    weightKg: request.package.weight_kg,
    lengthCm: request.package.length_cm,
    breadthCm: request.package.breadth_cm,
    heightCm: request.package.height_cm,
    pieces: request.package.pieces,
  },
  payment: {
    mode: request.payment.mode,
    collectableAmount: request.payment.collectable_amount,
  },
  invoice: {
    number: request.invoice.number,
    date: request.invoice.date,
    value: request.invoice.value,
  },
  items: request.items.map((item) => ({
    name: item.name,
    description: item.description,
    quantity: item.quantity,
    unitValue: item.unit_value,
    sku: item.sku,
    hsnCode: item.hsn_code,
  })),
  serviceLevel: request.service_level,
});
