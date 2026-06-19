import { ReactNode, TableHTMLAttributes } from "react";
import styles from "./Table.module.css";

export interface TableColumn<T> {
  key: keyof T | string;
  header: string;
  render?: (row: T) => ReactNode;
}

export interface TableProps<T> {
  className?: string;
  columns: TableColumn<T>[];
  data: T[];
  emptyState?: ReactNode;
  getRowKey: (row: T) => string;
  tableClassName?: string;
  tableProps?: TableHTMLAttributes<HTMLTableElement>;
  wrapperClassName?: string;
}

function Table<T>({
  className = "",
  columns,
  data,
  emptyState,
  getRowKey,
  tableClassName = "",
  tableProps,
  wrapperClassName = "",
}: TableProps<T>) {
  return (
    <div className={`${styles.wrapper} ${wrapperClassName} ${className}`}>
      <table className={`${styles.table} ${tableClassName}`} {...tableProps}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={String(column.key)}>{column.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 && emptyState ? (
            <tr>
              <td colSpan={columns.length}>{emptyState}</td>
            </tr>
          ) : (
            data.map((row) => (
              <tr key={getRowKey(row)}>
                {columns.map((column) => (
                  <td key={String(column.key)}>
                    {column.render ? column.render(row) : String(row[column.key as keyof T] ?? "")}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export default Table;
