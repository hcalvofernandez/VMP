from odoo import models, fields


class ConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    use_zebra_printer = fields.Boolean(
        'Plugin QZ Tray', config_parameter='print.use_zebra_printer'
    )
