/**
 * Amortización Francesa
 * A = P * [i(1+i)^n] / [(1+i)^n - 1]
 */
function calculateAmortization(monto, tasaMensual, plazoMeses, fechaInicio) {
    const i = tasaMensual / 100;
    const n = plazoMeses;
    const P = parseFloat(monto);

    const cuotaMensual = P * (i * Math.pow(1 + i, n)) / (Math.pow(1 + i, n) - 1);

    let saldo = P;
    const planPagos = [];
    let fechaActual = new Date(fechaInicio + 'T12:00:00'); // avoid timezone issues

    for (let num = 1; num <= n; num++) {
        const interes = saldo * i;
        const capital = cuotaMensual - interes;
        saldo -= capital;

        fechaActual.setMonth(fechaActual.getMonth() + 1);

        planPagos.push({
            numero_cuota: num,
            fecha_vencimiento: fechaActual.toISOString().split('T')[0],
            monto_cuota: parseFloat(cuotaMensual.toFixed(2)),
            capital: parseFloat(capital.toFixed(2)),
            interes: parseFloat(interes.toFixed(2)),
            saldo: parseFloat(Math.max(0, saldo).toFixed(2)),
            estado: 'Pendiente'
        });
    }

    return planPagos;
}

function calcularResumen(monto, tasaMensual, plazoMeses) {
    const i = tasaMensual / 100;
    const n = plazoMeses;
    const P = parseFloat(monto);

    const cuotaMensual = P * (i * Math.pow(1 + i, n)) / (Math.pow(1 + i, n) - 1);
    const totalPagar = cuotaMensual * n;
    const totalIntereses = totalPagar - P;

    return {
        cuota_mensual: parseFloat(cuotaMensual.toFixed(2)),
        monto_total: parseFloat(totalPagar.toFixed(2)),
        interes_total: parseFloat(totalIntereses.toFixed(2))
    };
}

module.exports = { calculateAmortization, calcularResumen };
