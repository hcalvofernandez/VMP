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

from odoo import api, fields, models, _


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    @api.model
    def load_rfid_settings(self):
        record = {}
        settings_is_rfid_login = self.env['ir.config_parameter'].sudo().search([('key', '=', 'is_rfid_login')])
        if settings_is_rfid_login:
            record['is_rfid_login'] = settings_is_rfid_login.value
            return [record]

    def get_values(self):
        res = super(ResConfigSettings, self).get_values()
        res.update(
            google_api_key = self.env['ir.config_parameter'].sudo().get_param('google_api_key'),
            theme_selector = self.env['ir.config_parameter'].sudo().get_param('theme_selector'),
            gen_ean13 = self.env['ir.config_parameter'].sudo().get_param('gen_ean13'),
            kitchen_screen_timer = self.env['ir.config_parameter'].sudo().get_param('kitchen_screen_timer'),
            last_token_number = self.env['ir.config_parameter'].sudo().get_param('last_token_number'),
            is_rfid_login = self.env['ir.config_parameter'].sudo().get_param('is_rfid_login'),
        )
        return res

    def set_values(self):
        res = super(ResConfigSettings, self).set_values()
        self.env['ir.config_parameter'].sudo().set_param('google_api_key', self.google_api_key or '')
        self.env['ir.config_parameter'].sudo().set_param('theme_selector', self.theme_selector or False)
        self.env['ir.config_parameter'].sudo().set_param('gen_ean13', self.gen_ean13 or '')
        self.env['ir.config_parameter'].sudo().set_param('kitchen_screen_timer', self.kitchen_screen_timer or False)
        self.env['ir.config_parameter'].sudo().set_param('last_token_number', self.last_token_number or '0')
        self.env['ir.config_parameter'].sudo().set_param('is_rfid_login', self.is_rfid_login or False)
        return res

    @api.model
    def load_settings(self, fields):
        res_config_settings = self.env['res.config.settings'].sudo().search_read([], [fields], order='id desc', limit=1, offset=0)
        return res_config_settings or False

    google_api_key = fields.Char('Google API key')
    theme_selector = fields.Selection([('gray_scale', 'Escala de Grises'),('black_yellow','Black Yellow'),('multi_color','Restaurant')])
#     theme_selector = fields.Selection([('black_yellow','Black Yellow'),('multi_color','Restaurant'),
#                                        ('blue_white','Blue White')])
    gen_ean13 = fields.Boolean("On Product create generate EAN13")
    kitchen_screen_timer = fields.Boolean(string="Timer In Kitchen Screen")
    last_token_number = fields.Char(string="Last Token Number")
    is_rfid_login = fields.Boolean("RFID Pos Login")


class res_company(models.Model):
    _inherit = "res.company"

    @api.one
    def write(self, vals):
        current_shop_ids = self.shop_ids
        res = super(res_company, self).write(vals)
        if 'shop_ids' in vals:
            current_shop_ids -= self.shop_ids
            for shop in current_shop_ids:
                shop.company_id = False
            for shop in self.shop_ids:
                shop.company_id = self
        return res

    pos_price = fields.Char(string="Pos Price", size=1)
    pos_quantity = fields.Char(string="Pos Quantity", size=1)
    pos_discount = fields.Char(string="Pos Discount", size=1)
    pos_search = fields.Char(string="Pos Search", size=1)
    pos_next = fields.Char(string="Pos Next order", size=1)
    payment_total = fields.Char(string="Payment", size=1)
    report_ip_address = fields.Char(string="Thermal Printer Proxy IP")
    shop_ids = fields.Many2many("pos.shop", 'pos_shop_company_rel', 'shop_id', 'company_id', string='Allow Shops')
# vim:expandtab:smartindent:tabstop=4:softtabstop=4:shiftwidth=4: