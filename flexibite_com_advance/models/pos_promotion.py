# -*- coding: utf-8 -*-
#################################################################################
# Author      : Acespritech Solutions Pvt. Ltd. (<www.acespritech.com>)
# Copyright(c): 2012-Present Acespritech Solutions Pvt. Ltd.
# All Rights Reserved.
#
# This program is copyright property of the author mentioned above.
# You can`t redistribute it and/or modify it.
#
#################################################################################

import datetime
from dateutil.relativedelta import relativedelta
from odoo import api, fields, models, _
from odoo.exceptions import UserError,ValidationError

class Pos_promotion(models.Model):
    _name = 'pos.promotion'
    _order = "sequence"
    _rec_name = 'promotion_code'
    _description = 'Pos Promotion'

    AVAILABLE_TIMES = [
        ('0', '0'),('1', '1'),('2', '2'),('3', '3'),('4', '4'),('5', '5'),
        ('6', '6'),('7', '7'),('8', '8'),('9', '9'),('10', '10'),('11', '11'),
        ('12', '12'),('13', '13'),('14', '14'),('15', '15'),('16', '16'),('17', '17'),
        ('18', '18'),('19', '19'),('20', '20'),('21', '21'),('22', '22'),('23', '23')
    ]

    promotion_code = fields.Char('Promotion Code',require=True)
    promotion_type = fields.Selection([('buy_x_get_y','Buy X Get Y Free'),
                                       ('buy_x_get_dis_y','Buy X Get Discount On Y'),
                                       ('dicount_total','Discount (%) on Total Amount'),
                                       ('quantity_discount','Percent Discount on Quantity'),
                                       ('quantity_price','Fix Discount on Quantity'),
                                       ('discount_on_multi_product','Discount On Combination Products'),
                                       ('discount_on_multi_categ','Discount On Multiple Categories'),
                                       ('discount_on_above_price','Discount On Above Price')],
                                      default="buy_x_get_y",require=True)
    from_date = fields.Date('From')
    to_date = fields.Date('To')
    from_time = fields.Selection(AVAILABLE_TIMES , string="From Time")
    to_time = fields.Selection(AVAILABLE_TIMES, string="To Time")
    day_of_week_ids = fields.Many2many('day.week', string="Day Of The Week", required=True)
    pos_condition_ids = fields.One2many('pos.conditions','pos_promotion_rel')
    pos_quntity_ids = fields.One2many('quantity.discount','pos_quantity_rel')
    pos_quntity_amt_ids = fields.One2many('quantity.discount.amt','pos_quantity_amt_rel')
    pos_quntity_dis_ids = fields.One2many('get.discount','pos_quantity_dis_rel')
    product_id_qty = fields.Many2one('product.product')
    product_id_amt = fields.Many2one('product.product')
#     product_id_x_y = fields.Many2one('product.product')
    multi_products_discount_ids = fields.One2many('discount.multi.products','multi_product_dis_rel')
    multi_categ_discount_ids = fields.One2many('discount.multi.categories','multi_categ_dis_rel')
    sequence = fields.Integer(help="Gives the sequence order when displaying a list of promotions.")
    #invoice page
    total_amount = fields.Float('Total Invoice Amount')
    operator = fields.Selection([('is_eql_to','Is Equal To'),
                                 ('greater_than_or_eql','Greater Than Or Equal')])
    total_discount = fields.Float('Total Discount(%)')
    discount_product = fields.Many2one("product.product","Discount Product")
    active = fields.Boolean(default=True)
    parent_product_ids = fields.Many2many(comodel_name='product.product', string="Products")
    discount_price_ids = fields.One2many('discount.above.price','pos_promotion_id')

    @api.model
    def default_get(self, fields_list):
        res = super(Pos_promotion, self).default_get(fields_list)
        days = self.env['day.week'].search([])
        list_day = []
        for rec in days:
            list_day.append(rec.id)
        res['day_of_week_ids'] = [(6, 0, list_day)]
        return res

    @api.constrains('from_date','to_date')
    def date_check(self):
        if self.from_date > self.to_date:
            raise ValidationError("To Date must be greater than From date")

    @api.constrains('from_time', 'to_time')
    def time_check(self):
        if self.from_time and not self.to_time:
            raise ValidationError("You have to set 'To' Time.")
        if not self.from_time and self.to_time:
            raise ValidationError("You have to set 'From' Time.")
        if self.from_time and self.to_time and int(self.from_time) > int(self.to_time):
            raise ValidationError("To Time must be greater than From Time")


class Conditions_data(models.Model):
    _name = 'pos.conditions'
    _description = 'Pos Conditions'

    pos_promotion_rel = fields.Many2one('pos.promotion')
    product_x_id = fields.Many2one('product.product','Product(X)')
    operator = fields.Selection([('is_eql_to','Is Equal To'), 
                               ('greater_than_or_eql','Greater Than Or Equal')])
    quantity = fields.Float('Quantity(X)')
    product_y_id = fields.Many2one('product.product','Product(Y)')
    quantity_y = fields.Float('Quantity(Y)')

class quantity_discount(models.Model):
    _name='quantity.discount'
    _description = 'Quantity Discount'

    pos_quantity_rel = fields.Many2one('pos.promotion')
    quantity_dis = fields.Integer('Quantity')
    discount_dis = fields.Float('Discount(%)')

class quantity_discount_amt(models.Model):
    _name = 'quantity.discount.amt'
    _description = "Quantity Discount Amount"

    pos_quantity_amt_rel = fields.Many2one('pos.promotion')
    quantity_amt = fields.Integer('Quantity')
    discount_price = fields.Float('Discount Price (Fixed)')

class Get_product_discount(models.Model):
    _name = 'get.discount'
    _description = "Get Discount"

    pos_quantity_dis_rel = fields.Many2one('pos.promotion')
    product_id_dis = fields.Many2one('product.product','Product')
    qty = fields.Float("Min. Quantity")
    discount_dis_x = fields.Float('Discount (%)')

class Discount_On_Multiple_Products(models.Model):
    _name = 'discount.multi.products'
    _description = "Discount on Products"

    multi_product_dis_rel = fields.Many2one('pos.promotion')
    products_discount = fields.Float("Discount")
    product_ids = fields.Many2many(comodel_name='product.product', string="Products")

class Discount_On_Multiple_Categories(models.Model):
    _name = 'discount.multi.categories'
    _description = "Discount on Categories"

    multi_categ_dis_rel = fields.Many2one('pos.promotion')
    categ_discount = fields.Float("Discount")
    categ_ids = fields.Many2many(comodel_name='pos.category', string="Categories")

class Discount_On_Above_Price(models.Model):
    _name = 'discount.above.price'
    _description = "Discount if price is above define price"

    pos_promotion_id = fields.Many2one('pos.promotion')
    discount = fields.Float("Discount (%)")
    price = fields.Float("Price")
    discount_type = fields.Selection([('percentage','Percentage'),
                                      ('fix_price','Fix Price'),
                                      ('free_product','Free Product')])
    fix_price_discount = fields.Char("Price Discount")
#     free_product_ids = fields.Many2many('product.product','free_products_rel', string="Free Products")
    product_categ_ids = fields.Many2many('pos.category','discount_pos_categ_rel', string="Categories")
    free_product = fields.Many2one('product.product',string="Product")

class DayWeek(models.Model):
    _name = 'day.week'
    _description = "Week days"

    name = fields.Char(string="Name")

# vim:expandtab:smartindent:tabstop=4:softtabstop=4:shiftwidth=4: