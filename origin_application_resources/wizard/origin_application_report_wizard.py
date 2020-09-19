# -*- coding:utf-8 -*-
from odoo import models, fields, api


class ReportWizard(models.TransientModel):
    _name = 'origin_application_resources.report_wizard'
    _description = 'Configuration of the report dates'

    start_date = fields.Date(string='Fecha inicial', required=True, default=fields.Date.context_today)
    end_date = fields.Date(string='Fecha Final', required=True, default=fields.Date.context_today)

    @api.multi
    def print_report(self):
        action = self.env.ref('origin_application_resources.origin_application_resources_report')
        data = {
            "start_date": self.start_date,
            "end_date": self.end_date,
        }
        return action.report_action(self, data=data, config=False)

