export default function Button({ type = 'green', children, onClick }) {
  const classes = {
    green: 'btn btn-green',
    blue: 'btn btn-blue',
    red: 'btn btn-red',
  };
  return (
    <button className={classes[type]} onClick={onClick}>
      {children}
    </button>
  );
}
