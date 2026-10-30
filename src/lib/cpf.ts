// CPF: 11 dígitos, os dois últimos são verificadores (módulo 11). Sequências iguais são inválidas.
export function cpfDigits(value: string): string {
  return value.replace(/\D/g, "");
}

export function isValidCpf(value: string): boolean {
  const d = cpfDigits(value);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const check = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    return ((sum * 10) % 11) % 10;
  };
  return check(9) === Number(d[9]) && check(10) === Number(d[10]);
}

// Máscara 000.000.000-00 enquanto a pessoa digita.
export function maskCpf(value: string): string {
  const d = cpfDigits(value).slice(0, 11);
  return d.replace(/^(\d{3})(\d{1,3})/, "$1.$2").replace(/^(\d{3})\.(\d{3})(\d{1,3})/, "$1.$2.$3").replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d{1,2})/, "$1.$2.$3-$4");
}
