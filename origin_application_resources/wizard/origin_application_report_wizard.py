# -*- coding:utf-8 -*-
from odoo import models, fields, api


class ReportWizard(models.TransientModel):
    _name = 'origin_application_resources.report_wizard'
    _description = 'Configuration of the report dates'

    liquidation_ids = fields.Many2many('account.move', string='Liquidation', required=True,
                                       domain=[('oar_type', '=', 'liquidation'), ('state', '=', 'posted'),])

    @api.multi
    def print_report(self):
        action = self.env.ref('origin_application_resources.origin_application_resources_report')
        data = {
            "liquidation_periods": self.liquidation_ids.ids,
            "last_date": max(self.liquidation_ids.mapped('date'))
        }
        return action.report_action(self, data=data, config=False)
