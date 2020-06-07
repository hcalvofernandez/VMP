from odoo import models, fields, api
from odoo.exceptions import Warning

class pos_session(models.Model):
    _inherit = 'pos.session'

    is_autocomputed = fields.Boolean("Fechas Automatizadas", related='config_id.company_id.is_autocomputed')
    start_day_datetime = fields.Datetime(string="Inicio", related='config_id.company_id.start_day_datetime', store=True)
    ends_day_datetime  = fields.Datetime(string="Fin", related='config_id.company_id.ends_day_datetime', store=True)    

    @api.multi
    def action_pos_session_open(self):
        session = super(pos_session,self).action_pos_session_open()
        if(not self.on_open_check_datatimes_between()):
            raise Warning('La fecha y hora actual no esta dentro del horario establecido para permitir ventas a través del punto de venta.')
        return session

    def is_current_datetime_between(self, params):
        return self.config_id.company_id.is_current_datetime_between(params)
    
    def compute_is_autocomputed(self):
        for record in self:
            record.is_autocomputed = record.config_id.company_id.get_is_autocomputed()

    def compute_start_day_datetime(self):
        for record in self:
            record.start_day_datetime = record.config_id.company_id.get_start_day_datetime()
    
    def compute_ends_day_datetime(self):
        for record in self:
            record.ends_day_datetime = record.config_id.company_id.get_ends_day_datetime()

    @api.model
    def get_user_pos_session(self, params):
        pos_session = self.env['pos.session'].search([('user_id','=',self.env.user.id), ('state','=','opened')], limit=1)
        if(pos_session):
            return pos_session.read()
        return False

    def on_open_check_datatimes_between(self): 
        return self.is_current_datetime_between([])            