# Restaurant operations

This context describes the shared catalog and the movement of products between locations in a restaurant organization.

## Products and transfers

**Product**:
An organization-owned catalog item that can be counted or moved between locations in one or more units.
_Avoid_: Item, article, stock item

**Transfer**:
A recorded movement of product quantities from one location to another at a stated time, with one responsible user.
_Avoid_: Shipment, delivery

**Maximum transfer temperature**:
An optional upper temperature limit in degrees Celsius for a Product.
_Avoid_: Default temperature, target temperature

**Transfer temperature**:
The measured temperature of one distinct Product when a Transfer is recorded. A Product has one measurement even when the Transfer lists it in several units.
_Avoid_: Unit temperature, line temperature

**Temperature deviation**:
A Transfer temperature above the Maximum transfer temperature captured for that Transfer.
_Avoid_: Invalid temperature, temperature error
