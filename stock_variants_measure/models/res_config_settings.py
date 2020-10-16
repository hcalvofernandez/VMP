# -*- coding: utf-8 -*-

from odoo import fields, models, api


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    inflation_cost = fields.Float(string="Inflation Margin",
                                  help="Percentage allowed to increase or decrease the cost of the product",
                                  groups="stock_variants_measure.group_inventory_cost_manager")

    @api.model
    def get_values(self):
        res = super(ResConfigSettings, self).get_values()
        param = float(self.env['ir.config_parameter'].get_param('stock_variants_measure.inflation_cost'))
        res['inflation_cost'] = param
        return res

    @api.multi
    def set_values(self):
        super(ResConfigSettings, self).set_values()
        self.ensure_one()
        value = self.inflation_cost
        self.env['ir.config_parameter'].set_param('stock_variants_measure.inflation_cost', value)
