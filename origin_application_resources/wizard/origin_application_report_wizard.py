# -*- coding:utf-8 -*-
from odoo import models, fields, api


class ReportWizard(models.TransientModel):
    _name = 'origin_application_resources.report_wizard'
    _description = 'Configuration of the report dates'

    liquidation_id = fields.Many2one('origin_application_resources.liquidation_log',
                                     string='Liquidation', required=True,)

    @api.multi
    def print_report(self):
        action = self.env.ref('origin_application_resources.origin_application_resources_report')
        data = {
            "liquidation_id": self.liquidation_id.id,
        }
        return action.report_action(self, data=data, config=False)
