from odoo import models, fields, api
from odoo.exceptions import Warning

class pos_config(models.Model):
    _inherit = 'pos.config'

    is_autocomputed = fields.Boolean("Fechas Automatizadas", related='company_id.is_autocomputed')
    start_day_datetime = fields.Datetime(string="Inicio", related='company_id.start_day_datetime', store=True)
    ends_day_datetime  = fields.Datetime(string="Fin", related='company_id.ends_day_datetime', store=True)

    def is_current_datetime_between(self, params):
        return self.company_id.is_current_datetime_between(params)
    
    def compute_is_autocomputed(self):
        for record in self:
            record.is_autocomputed = record.company_id.get_is_autocomputed()
            
    def compute_start_day_datetime(self):
        for record in self:
            record.start_day_datetime = record.company_id.get_start_day_datetime()
    
    def compute_ends_day_datetime(self):
        for record in self:
            record.ends_day_datetime = record.company_id.get_ends_day_datetime()
    