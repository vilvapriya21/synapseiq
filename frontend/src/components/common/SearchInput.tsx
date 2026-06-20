import { type InputHTMLAttributes } from "react";
import { Search } from "lucide-react";
import styles from "./SearchInput.module.css";

interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  wrapperClassName?: string;
}

function SearchInput({ className = "", wrapperClassName = "", ...props }: SearchInputProps) {
  return (
    <div className={`${styles.search} ${wrapperClassName}`}>
      <Search aria-hidden="true" size={18} />
      <input {...props} className={`${styles.input} ${className}`} type="search" />
    </div>
  );
}

export default SearchInput;
