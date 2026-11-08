import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

export interface ReceiptData {
  company: string;
  address: string;
  phone: string;
  saleId: number;
  saleTime: string;
  customerName: string;
  lines: {
    description: string;
    itemNumber?: string;
    quantity: number;
    unitPrice: number;
    discount?: number;
    total?: number;
  }[];
  taxes: { name: string; amount: number; taxType?: number }[];
  subtotal?: number;
  total: number;
  payments: { type: string; amount: number }[];
  change: number;
}

const styles = StyleSheet.create({
  page: { padding: 24, fontSize: 10 },
  header: { textAlign: "center", marginBottom: 8 },
  bold: { fontFamily: "Helvetica-Bold" },
  meta: { marginBottom: 8 },
  row: { flexDirection: "row", justifyContent: "space-between", marginTop: 2 },
  divider: { marginTop: 4, marginBottom: 4, borderBottom: "1px solid #000" },
});

export function ReceiptDocument({ data }: { data: ReceiptData }) {
  return (
    <Document>
      <Page size="A6" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.bold}>{data.company}</Text>
          <Text>{data.address}</Text>
          <Text>{data.phone}</Text>
        </View>
        <View style={styles.meta}>
          <Text>Receipt #{data.saleId}</Text>
          <Text>Date: {data.saleTime}</Text>
          <Text>Customer: {data.customerName}</Text>
        </View>
        <View style={styles.divider} />
        {data.lines.map((l, i) => (
          <View key={i} style={styles.row}>
            <Text>{l.description} × {l.quantity}</Text>
            <Text>{(l.total ?? l.unitPrice * l.quantity).toFixed(2)}</Text>
          </View>
        ))}
        <View style={styles.divider} />
        {data.taxes.map((t, i) => (
          <View key={i} style={styles.row}>
            <Text>Tax {t.name}</Text>
            <Text>{t.amount.toFixed(2)}</Text>
          </View>
        ))}
        <View style={[styles.row, styles.bold]}>
          <Text>Total</Text>
          <Text>{data.total.toFixed(2)}</Text>
        </View>
        {data.payments.map((p, i) => (
          <View key={i} style={styles.row}>
            <Text>{p.type}</Text>
            <Text>{p.amount.toFixed(2)}</Text>
          </View>
        ))}
        <View style={styles.row}>
          <Text>Change</Text>
          <Text>{data.change.toFixed(2)}</Text>
        </View>
      </Page>
    </Document>
  );
}