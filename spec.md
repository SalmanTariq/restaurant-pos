# Simple Restaurant POS System Spec

## Goal

Build a simple offline-first restaurant POS system for a small restaurant. The system should be easy for staff to use, support takeaway and table orders, print order tokens, track sales, and show end-of-day item and expense reports.

## Main Users

- Cashier
- Restaurant owner/manager
- Kitchen staff, if kitchen token printing is used

## Core Requirements

### 1. Order Taking

The cashier should be able to create a new order quickly.

Each order should support:

- Takeaway order
- Table order
- Multiple menu items
- Item quantity
- Item price
- Order total
- Paid/unpaid status
- Cancelled order status

### 2. Menu Items

The owner or manager should be able to manage menu items.

Each menu item should have:

- Item name
- Category
- Sale price
- Active/inactive status

Example items:

- Nihari plate
- Salan plate
- Roti
- Drinks
- Tea

### 3. Token Printing

The system should generate a token number for every order.

The token should show:

- Token number
- Order type: takeaway or table
- Table number, if applicable
- Ordered items and quantities
- Time and date
- Total amount, if needed

Printing should work with a normal receipt/token printer.

### 4. Table Orders

For dine-in orders, the cashier should be able to select a table number.

Table orders should support:

- Open table order
- Add more items later
- Mark as paid
- Close table after payment

### 5. Takeaway Orders

For takeaway orders, the system should generate a simple token number.

The cashier should be able to:

- Create takeaway order
- Print token
- Mark order as paid
- Complete order

### 6. Daily Sales Report

At the end of the day, the owner should be able to see a simple sales report.

The report should show:

- Total sales amount
- Total orders
- Cash sales
- Card sales, if card payment is used
- Cancelled orders
- Item-wise quantity sold

Example:

- Nihari plate: 45 sold
- Salan plate: 20 sold
- Roti: 180 sold
- Tea: 35 sold

### 7. Daily Expenses

The system should allow daily expenses to be entered.

Each expense should have:

- Expense title
- Category
- Amount
- Date
- Notes, optional

Example expense categories:

- Labor
- Grocery
- Gas
- Electricity
- Cleaning
- Other

The daily report should show:

- Total sales
- Total expenses
- Net cash after expenses

### 8. Offline Support

The system must work without internet.

Required offline behavior:

- Orders can be created offline
- Tokens can be printed offline
- Menu items are available offline
- Daily reports are available offline
- Expenses can be added offline

Internet should only be needed for optional backup or future cloud sync.

## Recommended Tech Stack

- Desktop app: Tauri
- Frontend: React with TypeScript
- Local database: SQLite
- Printing: receipt printer support through Windows/browser printing first, direct thermal printer support later

## First Version Scope

The first version should include:

- Login screen
- POS order screen
- Menu item management
- Takeaway orders
- Table orders
- Token printing
- Daily sales report
- Item quantity report
- Daily expenses
- Local database
- Local backup option

## Not Required In First Version

These features can be added later:

- Online ordering
- Delivery app integration
- Full inventory management
- Customer loyalty
- Advanced accounting
- Multi-branch support
- Cloud dashboard
- Mobile app
- Kitchen display screen

## Success Criteria

The system is successful if restaurant staff can:

- Take an order in under 30 seconds
- Print a token immediately
- Use the system without internet
- See total daily/monthly sales 
- See how many plates/items were sold
- Enter daily labor and expense amounts
- Get a clear end-of-day cash summary
- Run basic accounting