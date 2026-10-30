-- EventHubs · formulário: tipo de campo CPF (validado no servidor; opcional por evento).
alter type public.form_field_type add value if not exists 'cpf';
