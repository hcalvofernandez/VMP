# -*- coding: utf-8 -*-

import logging

from odoo import _, api, fields, models

_logger = logging.getLogger("______________________________________________________" + __name__)


class ComputerEquipment(models.Model):
    _name = 'flexibite_com_advance.computer_equipment'

    _sql_constraints = [('computer_equipment_ip_unique', 'unique(ip)', u'Ya existe un equipo de cómputo con ese ip.')]

    name = fields.Char('Nombre', required=True)
    ip = fields.Char('Dirección IP',  required=True)



